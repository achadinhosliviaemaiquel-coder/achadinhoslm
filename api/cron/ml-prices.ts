// api/cron/ml-prices.ts
type VercelRequest = any;
type VercelResponse = any;
import { createClient } from "@supabase/supabase-js";

type StoreOffer = {
  id: number; // bigint
  product_id: string; // uuid
  platform: string; // enum label
  external_id: string | null; // MLB...
  is_active: boolean;
};

type MLItemResponse = {
  id: string; // "MLB123..."
  price?: number | null;
  original_price?: number | null;
  currency_id?: string | null;
  status?: string;
};

type JobCounters = {
  scanned: number;
  updated: number;

  // falhas "de verdade" (DB write, 5xx finais, etc)
  failed: number;

  // observabilidades
  http429: number;
  retries: number;

  // novos
  notFoundDeactivated: number; // 404 -> is_active=false
  authErrors: number; // 401/403 sem refresh, ou refresh falhou
  invalidExternalIdSkipped: number;
};

function getEnv() {
  const SUPABASE_URL = process.env.SUPABASE_URL || "";
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const CRON_SECRET = process.env.CRON_SECRET || "";

  const ML_CLIENT_ID = process.env.ML_CLIENT_ID || "";
  const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || "";

  const ML_API_BASE = process.env.ML_API_BASE || "https://api.mercadolibre.com";
  const BATCH_SIZE = Number(process.env.ML_PRICE_BATCH_SIZE || "150");
  const MAX_CONCURRENCY = Number(process.env.ML_PRICE_CONCURRENCY || "8");
  const MAX_RETRIES = Number(process.env.ML_PRICE_MAX_RETRIES || "3");
  const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!CRON_SECRET) missing.push("CRON_SECRET");
  if (!ML_CLIENT_ID) missing.push("ML_CLIENT_ID");
  if (!ML_CLIENT_SECRET) missing.push("ML_CLIENT_SECRET");
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);

  return {
    SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET,
    ML_CLIENT_ID,
    ML_CLIENT_SECRET,
    ML_API_BASE,
    BATCH_SIZE,
    MAX_CONCURRENCY,
    MAX_RETRIES,
    PLATFORM_LABEL,
  };
}

function utcDateString(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`; // YYYY-MM-DD
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isValidMLB(externalId: string | null): externalId is string {
  return !!externalId && /^MLB[0-9]+$/.test(externalId);
}

function readHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<{ errors: unknown[] }> {
  const errors: unknown[] = [];
  let i = 0;

  const runners = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        try {
          await worker(items[idx]);
        } catch (e) {
          errors.push(e);
        }
      }
    });

  await Promise.all(runners);
  return { errors };
}

async function refreshMlToken(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string,
  tokenRowId: number,
  refreshToken: string,
) {
  const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });

  const raw = (await tokenRes.json().catch(() => ({}))) as any;
  if (!tokenRes.ok) {
    throw new Error(`ML refresh failed: ${JSON.stringify(raw).slice(0, 500)}`);
  }

  const access_token = raw.access_token as string | undefined;
  const refresh_token = (raw.refresh_token as string | undefined) ?? refreshToken;
  const expires_in = Number(raw.expires_in || 0);

  if (!access_token || !expires_in) {
    throw new Error(`ML refresh invalid payload: ${JSON.stringify(raw).slice(0, 500)}`);
  }

  const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

  const { error } = await supabase
    .from("ml_oauth_tokens")
    .update({
      access_token,
      refresh_token,
      expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenRowId);

  if (error) throw new Error(`DB update ml_oauth_tokens failed: ${error.message}`);

  return { accessToken: access_token, refreshToken: refresh_token };
}

async function getValidMlAccessToken(
  supabase: ReturnType<typeof createClient>,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string;
  tokenRowId: number;
  refreshToken: string | null;
}> {
  const { data, error } = await supabase
    .from("ml_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .single<{
      id: number;
      access_token: string;
      refresh_token: string | null;
      expires_at: string;
    }>();

  if (error || !data) {
    throw new Error("Missing ml_oauth_tokens. Run OAuth: /api/ml/oauth/start");
  }

  const expiresAt = new Date(data.expires_at).getTime();
  const now = Date.now();

  if (expiresAt - now >= 2 * 60 * 1000) {
    return {
      accessToken: data.access_token,
      tokenRowId: data.id,
      refreshToken: data.refresh_token,
    };
  }

  // expirou e não tem refresh_token -> retorna mesmo assim e deixa o handler lidar com 401/403 sem quebrar
  if (!data.refresh_token) {
    return {
      accessToken: data.access_token,
      tokenRowId: data.id,
      refreshToken: null,
    };
  }

  const r = await refreshMlToken(supabase, clientId, clientSecret, data.id, data.refresh_token);

  return {
    accessToken: r.accessToken,
    tokenRowId: data.id,
    refreshToken: r.refreshToken,
  };
}

async function fetchWithRetry(url: string, job: JobCounters, maxRetries: number, accessToken: string) {
  let attempt = 0;
  let backoff = 400;

  while (true) {
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${accessToken}`,
          "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
      });

      if (res.status === 429) {
        job.http429 += 1;
        if (attempt >= maxRetries) return res;
        job.retries += 1;
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter ? Number(retryAfter) * 1000 : backoff;
        await sleep(Math.min(waitMs, 5000));
        attempt += 1;
        backoff *= 2;
        continue;
      }

      if (res.status >= 500 && res.status <= 599) {
        if (attempt >= maxRetries) return res;
        job.retries += 1;
        await sleep(Math.min(backoff, 5000));
        attempt += 1;
        backoff *= 2;
        continue;
      }

      return res;
    } catch (e) {
      if (attempt >= maxRetries) throw e;
      job.retries += 1;
      await sleep(Math.min(backoff, 5000));
      attempt += 1;
      backoff *= 2;
    }
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();

  try {
    const {
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      CRON_SECRET,
      ML_CLIENT_ID,
      ML_CLIENT_SECRET,
      ML_API_BASE,
      BATCH_SIZE,
      MAX_CONCURRENCY,
      MAX_RETRIES,
      PLATFORM_LABEL,
    } = getEnv();

    const got = readHeader(req, "x-cron-secret");
    if (got !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const job: JobCounters = {
      scanned: 0,
      updated: 0,
      failed: 0,
      http429: 0,
      retries: 0,
      notFoundDeactivated: 0,
      authErrors: 0,
      invalidExternalIdSkipped: 0,
    };

    const snapshotDate = utcDateString(new Date());

    // token ML (com refresh se possível)
    const tokenInfo = await getValidMlAccessToken(supabase, ML_CLIENT_ID, ML_CLIENT_SECRET);
    let accessToken = tokenInfo.accessToken;
    const tokenRowId = tokenInfo.tokenRowId;
    let refreshToken = tokenInfo.refreshToken;

    // lock de refresh (evita corrida entre workers)
    let refreshInFlight: Promise<{ accessToken: string; refreshToken: string } | null> | null = null;

    // se bater 401/403 e não houver refresh -> sinaliza para parar chamadas inúteis
    let authBroken = false;

    async function ensureFreshTokenOnAuthError(): Promise<boolean> {
      if (!refreshToken) {
        authBroken = true;
        job.authErrors += 1;
        return false;
      }

      if (!refreshInFlight) {
        refreshInFlight = (async () => {
          try {
            const r = await refreshMlToken(
              supabase,
              ML_CLIENT_ID,
              ML_CLIENT_SECRET,
              tokenRowId,
              refreshToken!,
            );
            return { accessToken: r.accessToken, refreshToken: r.refreshToken };
          } catch {
            return null;
          }
        })();
      }

      const r = await refreshInFlight;
      refreshInFlight = null;

      if (!r) {
        authBroken = true;
        job.authErrors += 1;
        return false;
      }

      accessToken = r.accessToken;
      refreshToken = r.refreshToken;
      return true;
    }

    // price_job_runs
    const { data: runRow, error: runErr } = await supabase
      .from("price_job_runs")
      .insert({
        platform: PLATFORM_LABEL,
        status: "running",
        stats: {
          snapshotDate,
          batchSize: BATCH_SIZE,
          concurrency: MAX_CONCURRENCY,
        },
      })
      .select("id")
      .single<{ id: number }>();

    if (runErr || !runRow?.id) {
      return res.status(500).json({
        ok: false,
        error: "Failed to create job run",
        details: runErr?.message,
      });
    }

    const jobRunId = runRow.id;

    let offset = 0;
    let lastErrorSample: string | null = null;

    while (true) {
      const { data: offers, error } = await supabase
        .from("store_offers")
        .select("id, product_id, platform, external_id, is_active")
        .eq("platform", PLATFORM_LABEL)
        .eq("is_active", true)
        .not("external_id", "is", null)
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw new Error(`DB read error: ${error.message}`);
      if (!offers || offers.length === 0) break;

      // se auth já está quebrada, não vale a pena seguir varrendo tudo
      if (authBroken) {
        lastErrorSample =
          lastErrorSample ??
          "ML auth broken (401/403) and no refresh available (or refresh failed). Re-run OAuth: /api/ml/oauth/start";
        break;
      }

      const filtered = (offers as StoreOffer[]).filter((o) => {
        const ok = isValidMLB(o.external_id);
        if (!ok) job.invalidExternalIdSkipped += 1;
        return ok;
      });

      job.scanned += filtered.length;

      if (filtered.length > 0) {
        const { errors: poolErrors } = await runPool(filtered, MAX_CONCURRENCY, async (offer) => {
          if (authBroken) return;

          const itemId = offer.external_id!;
          const url = `${ML_API_BASE}/items/${encodeURIComponent(itemId)}`;

          // 1) tentativa com token atual
          let mlRes = await fetchWithRetry(url, job, MAX_RETRIES, accessToken);

          // 2) 404 = Item inválido/expirado -> desativa e segue
          if (mlRes.status === 404) {
            const { error: deactErr } = await supabase
              .from("store_offers")
              .update({ is_active: false })
              .eq("id", offer.id);

            if (deactErr) {
              job.failed += 1;
              if (!lastErrorSample) {
                lastErrorSample = `Deactivate offer failed id=${offer.id}: ${deactErr.message}`.slice(
                  0,
                  500,
                );
              }
              return;
            }

            job.notFoundDeactivated += 1;
            return;
          }

          // 3) 401/403 -> tenta refresh 1x; se não der, não quebra job
          if (mlRes.status === 401 || mlRes.status === 403) {
            const ok = await ensureFreshTokenOnAuthError();
            if (!ok) {
              lastErrorSample =
                lastErrorSample ??
                "ML returned 401/403 and refresh_token is missing or refresh failed. Re-run OAuth: /api/ml/oauth/start";
              return;
            }

            // re-tenta 1x
            mlRes = await fetchWithRetry(url, job, MAX_RETRIES, accessToken);

            // se ainda 401/403 depois do refresh -> marca authBroken e para
            if (mlRes.status === 401 || mlRes.status === 403) {
              authBroken = true;
              job.authErrors += 1;
              lastErrorSample =
                lastErrorSample ??
                `ML still ${mlRes.status} after refresh attempt. Re-run OAuth: /api/ml/oauth/start`;
              return;
            }

            // se após refresh virou 404, também desativa
            if (mlRes.status === 404) {
              const { error: deactErr } = await supabase
                .from("store_offers")
                .update({ is_active: false })
                .eq("id", offer.id);

              if (deactErr) {
                job.failed += 1;
                if (!lastErrorSample) {
                  lastErrorSample = `Deactivate offer failed id=${offer.id}: ${deactErr.message}`.slice(
                    0,
                    500,
                  );
                }
                return;
              }

              job.notFoundDeactivated += 1;
              return;
            }
          }

          // 4) outros erros HTTP -> conta falha e segue (sem throw)
          if (!mlRes.ok) {
            job.failed += 1;
            const body = await mlRes.text().catch(() => "");
            const msg = `ML API ${mlRes.status} for ${itemId}: ${body.slice(0, 300)}`;
            if (!lastErrorSample) lastErrorSample = msg.slice(0, 500);
            return;
          }

          const raw = (await mlRes.json()) as MLItemResponse;

          const price = typeof raw.price === "number" ? raw.price : null;
          const original_price =
            typeof raw.original_price === "number" ? raw.original_price : null;
          const currency_id = raw.currency_id ?? null;

          // 1) upsert last price por offer_id
          const { error: upErr } = await supabase.from("offer_last_price").upsert(
            {
              offer_id: offer.id,
              currency_id,
              price,
              original_price,
              last_checked_at: new Date().toISOString(),
              raw,
            },
            { onConflict: "offer_id" },
          );

          if (upErr) {
            job.failed += 1;
            throw new Error(`Upsert offer_last_price failed offer_id=${offer.id}: ${upErr.message}`);
          }

          // 2) snapshot diário (1 por offer/dia)
          const { error: snapErr } = await supabase.from("offer_price_snapshots").upsert(
            {
              offer_id: offer.id,
              snapshot_date: snapshotDate,
              currency_id,
              price,
              original_price,
              collected_at: new Date().toISOString(),
              raw,
            },
            {
              onConflict: "offer_id,snapshot_date",
              ignoreDuplicates: true,
            },
          );

          if (snapErr) {
            job.failed += 1;
            throw new Error(`Upsert snapshot failed offer_id=${offer.id}: ${snapErr.message}`);
          }

          job.updated += 1;
        });

        if (poolErrors.length > 0 && !lastErrorSample) {
          lastErrorSample = String(
            poolErrors[0] instanceof Error ? poolErrors[0].message : poolErrors[0],
          ).slice(0, 500);
        }
      }

      offset += BATCH_SIZE;
      if (offers.length < BATCH_SIZE) break;
    }

    const durationMs = Date.now() - t0;

    // ✅ AJUSTE: incidentes operacionais (auth sem refresh, 404, etc) => partial (nunca failed).
    // "failed" fica reservado para erros estruturais que estouram no catch (500).
    const hadIncidents = job.failed > 0 || job.notFoundDeactivated > 0 || job.authErrors > 0;
    const finalStatus = !hadIncidents ? "success" : "partial";

    const { error: finErr } = await supabase
      .from("price_job_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: finalStatus,
        stats: {
          snapshotDate,
          batchSize: BATCH_SIZE,
          concurrency: MAX_CONCURRENCY,
          scanned: job.scanned,
          updated: job.updated,
          failed: job.failed,
          notFoundDeactivated: job.notFoundDeactivated,
          authErrors: job.authErrors,
          invalidExternalIdSkipped: job.invalidExternalIdSkipped,
          http429: job.http429,
          retries: job.retries,
          durationMs,
          authBroken,
        },
        error: lastErrorSample,
      })
      .eq("id", jobRunId);

    if (finErr) {
      return res.status(500).json({
        ok: false,
        error: "Failed to finish job run",
        details: finErr.message,
      });
    }

    return res.status(200).json({
      ok: true,
      status: finalStatus,
      snapshotDate,
      scanned: job.scanned,
      updated: job.updated,
      failed: job.failed,
      notFoundDeactivated: job.notFoundDeactivated,
      authErrors: job.authErrors,
      invalidExternalIdSkipped: job.invalidExternalIdSkipped,
      http429: job.http429,
      retries: job.retries,
      durationMs,
      authBroken,
      errorSample: lastErrorSample,
    });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}

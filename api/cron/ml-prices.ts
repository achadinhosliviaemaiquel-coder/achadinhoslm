// api/cron/ml-prices.ts - API oficial ML (sem cookie)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type StoreOffer = {
  id: number;
  product_id: string;
  platform: string;
  external_id: string | null;
  url: string | null;
  is_active: boolean;
  current_price_cents?: number | null;
  price_override_brl?: number | null;
};

type JobCounters = {
  scanned: number;
  updated: number;
  failed: number;
  invalidExternalIdSkipped: number;
  priceNotFound: number;
  timedOut: number;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const DEFAULT_LIMIT = Number(process.env.ML_PRICE_BATCH_SIZE || "10");
const MAX_CONCURRENCY = Number(process.env.ML_PRICE_CONCURRENCY || "1");
const MAX_RUN_MS = Number(process.env.ML_PRICE_MAX_RUN_MS || "45000");

function utcDateOnly(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseMlExternalId(externalId: string | null) {
  if (!externalId) return null;
  const m = externalId.match(/^(MLBU|MLB)(\d{6,14})$/i);
  if (!m) return null;
  return { prefix: m[1].toUpperCase() as "MLB" | "MLBU", digits: m[2], raw: `${m[1].toUpperCase()}${m[2]}` };
}

function isValidMLB(externalId: string | null): externalId is string {
  return !!parseMlExternalId(externalId);
}

function readHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function readCronSecret(req: VercelRequest): string {
  // 1. header x-cron-secret (legado/custom)
  const h = readHeader(req, "x-cron-secret");
  if (h) return h;

  // 2. Authorization: Bearer <secret> (mecanismo nativo Vercel CRON_SECRET)
  const auth = readHeader(req, "authorization");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();

  // 3. query param (dev local)
  try {
    const host = readHeader(req, "x-forwarded-host") || readHeader(req, "host");
    const proto =
      readHeader(req, "x-forwarded-proto") ||
      (host?.includes("localhost") ? "http" : "https");
    const url = new URL(req.url || "/", `${proto}://${host || "localhost"}`);
    return url.searchParams.get("cron_secret") || "";
  } catch {
    return "";
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let i = 0;
  const runners = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        try {
          await worker(items[idx]);
        } catch {
          // erros individuais são capturados no worker
        }
      }
    });
  await Promise.all(runners);
}

async function getPriceFromML(mlb: string, accessToken: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.mercadolibre.com/items/${mlb}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const item = await res.json();
    return item.price && item.price > 0 ? item.price : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
  const deadlineMs = t0 + MAX_RUN_MS;

  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-prices] ${new Date().toISOString()} ${s}`;
    logs.push(line);
    console.log(line);
  };

  const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const job: JobCounters = {
    scanned: 0,
    updated: 0,
    failed: 0,
    invalidExternalIdSkipped: 0,
    priceNotFound: 0,
    timedOut: 0,
  };

  let stoppedEarly = false;

  const got = readCronSecret(req);
  if (!got || got !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const host =
    readHeader(req, "x-forwarded-host") ||
    readHeader(req, "host") ||
    "localhost";
  const proto =
    readHeader(req, "x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  const u = new URL(req.url || "/", `${proto}://${host}`);

  const offset = Math.max(0, Number(u.searchParams.get("offset") || "0") || 0);
  const limit = Math.max(
    1,
    Math.min(
      50,
      Number(u.searchParams.get("limit") || String(DEFAULT_LIMIT)) || DEFAULT_LIMIT,
    ),
  );

  try {
    // Busca token OAuth
    const { data: tokenRow } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow) {
      throw new Error("Nenhum token encontrado. Rode /api/ml/oauth/start");
    }

    let accessToken = tokenRow.access_token;

    // Refresh automático se expirado
    if (new Date(tokenRow.expires_at) < new Date() && tokenRow.refresh_token) {
      log("Token expirado → refresh automático");
      const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.ML_CLIENT_ID!,
          client_secret: process.env.ML_CLIENT_SECRET!,
          refresh_token: tokenRow.refresh_token,
        }).toString(),
      });

      const data = await refreshRes.json();
      if (!refreshRes.ok) throw new Error("Refresh falhou");

      accessToken = data.access_token;

      await supabase
        .from("ml_oauth_tokens")
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        })
        .eq("id", tokenRow.id);

      log("Token renovado com sucesso");
    }

    log(`Token OK - offset=${offset} limit=${limit}`);

    const { data: offers, error } = await supabase
      .from("store_offers")
      .select("id, product_id, platform, external_id, url, is_active, current_price_cents, price_override_brl")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`DB read error: ${error.message}`);

    const page = (offers ?? []) as StoreOffer[];
    const filtered = page.filter((o) => {
      if (!isValidMLB(o.external_id)) {
        job.invalidExternalIdSkipped += 1;
        return false;
      }
      return true;
    });

    log(`Page offers=${page.length} valid=${filtered.length} skipped=${job.invalidExternalIdSkipped}`);

    await runPool(filtered, MAX_CONCURRENCY, async (offer) => {
      job.scanned += 1;

      if (Date.now() > deadlineMs) {
        stoppedEarly = true;
        job.timedOut += 1;
        return;
      }

      const mlb = offer.external_id!;

      // Usa override manual se definido (não chama a API)
      let price: number | null;
      if (offer.price_override_brl != null && Number.isFinite(Number(offer.price_override_brl))) {
        price = Number(offer.price_override_brl);
        log(`Override manual para ${mlb}: R$ ${price}`);
      } else {
        log(`Buscando preço para ${mlb}...`);
        price = await getPriceFromML(mlb, accessToken);
      }
      const nowIso = new Date().toISOString();

      if (price === null) {
        job.priceNotFound += 1;
        await supabase
          .from("store_offers")
          .update({ last_scrape_at: nowIso, last_scrape_status: "price_not_found", updated_at: nowIso })
          .eq("id", offer.id);
        return;
      }

      // Salva snapshot de preço (offer_id é o ID numérico da store_offer)
      await supabase.from("offer_last_price").upsert(
        {
          offer_id: offer.id,
          price,
          currency_id: "BRL",
          is_available: true,
          verified_at: nowIso,
          verified_date: utcDateOnly(),
          updated_at: nowIso,
          last_checked_at: nowIso,
        },
        { onConflict: "offer_id" },
      );

      // Atualiza store_offers com preço em centavos
      await supabase
        .from("store_offers")
        .update({
          current_price_cents: Math.round(price * 100),
          current_currency: "BRL",
          current_price_updated_at: nowIso,
          last_scrape_at: nowIso,
          last_scrape_status: "ok",
          updated_at: nowIso,
        })
        .eq("id", offer.id);

      // Atualiza preço direto no produto
      await supabase
        .from("products")
        .update({ mercadolivre_price: price, updated_at: nowIso })
        .eq("id", offer.product_id);

      job.updated += 1;
      log(`OK ${mlb} → R$ ${price}`);
    });

    return res.status(200).json({
      ok: true,
      updated: job.updated,
      total: page.length,
      stoppedEarly,
      job,
      durationMs: Date.now() - t0,
      logs: logs.slice(-100),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

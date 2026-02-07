import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

// Resolver behavior
const MAX_RETRIES = Number(process.env.ML_RESOLVE_MAX_RETRIES || "3");
const MAX_CONCURRENCY = Number(process.env.ML_RESOLVE_CONCURRENCY || "6");
const BATCH_SIZE = Number(process.env.ML_RESOLVE_BATCH_SIZE || "150");
const MAX_REDIRECT_HOPS = Number(process.env.ML_RESOLVE_REDIRECT_HOPS || "8");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractMLB(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/MLB\d+/);
  return m ? m[0] : null;
}

/**
 * Resolve SEC URL -> MLBxxxx
 * Strategy:
 * - manual redirects; walk Location chain up to MAX_REDIRECT_HOPS
 * - extract MLB from Location, final url, or html body (fallback)
 */
async function resolveSecToMLB(secUrl: string): Promise<string> {
  let attempt = 0;
  let backoff = 400;

  while (true) {
    try {
      let current = secUrl;
      let hops = 0;

      while (hops <= MAX_REDIRECT_HOPS) {
        const res = await fetch(current, {
          method: "GET",
          redirect: "manual",
          headers: {
            // Ajuda a evitar bloqueios bobos de bot.
            "user-agent":
              process.env.ML_RESOLVE_USER_AGENT ||
              "Mozilla/5.0 (compatible; ml-resolver/1.0; +https://vercel.app)",
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          },
        });

        // Transientes comuns -> retry externo
        if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
          throw new Error(`Transient SEC status=${res.status}`);
        }

        const locRaw = res.headers.get("location");
        const mlbFromLoc = extractMLB(locRaw);
        if (mlbFromLoc) return mlbFromLoc;

        // Normaliza Location relativo (muito comum)
        let nextUrl: string | null = null;
        if (locRaw) {
          try {
            nextUrl = new URL(locRaw, current).toString();
          } catch {
            nextUrl = locRaw; // fallback
          }
        }

        // Se for redirect e tem próximo, segue
        if (res.status >= 300 && res.status < 400 && nextUrl) {
          const mlbFromNext = extractMLB(nextUrl);
          if (mlbFromNext) return mlbFromNext;

          current = nextUrl;
          hops += 1;
          continue;
        }

        // Se chegou em 200 sem MLB em location, tenta URL final e body
        const mlbFromFinalUrl = extractMLB((res as any).url || current);
        if (mlbFromFinalUrl) return mlbFromFinalUrl;

        if (res.status === 200) {
          const body = await res.text().catch(() => "");
          const mlbFromBody = extractMLB(body);
          if (mlbFromBody) return mlbFromBody;
        }

        // Não é redirect, não achou MLB -> quebra pra retry/erro final
        throw new Error(
          `SEC resolve no-mlb: status=${res.status} url=${current} location=${locRaw ?? "null"}`
        );
      }

      throw new Error(`SEC resolve redirect-loop: url=${secUrl} hops>${MAX_REDIRECT_HOPS}`);
    } catch (e: any) {
      // retry/backoff
      if (attempt >= MAX_RETRIES) throw e;

      await sleep(Math.min(backoff, 5000));
      attempt += 1;
      backoff *= 2;
    }
  }
}

async function runPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<{ results: R[]; errors: { item: T; error: unknown }[] }> {
  let i = 0;
  const results: R[] = [];
  const errors: { item: T; error: unknown }[] = [];

  const runners = new Array(Math.min(concurrency, items.length)).fill(null).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      const item = items[idx];
      try {
        const r = await worker(item);
        results.push(r);
      } catch (err) {
        errors.push({ item, error: err });
      }
    }
  });

  await Promise.all(runners);
  return { results, errors };
}

type LinkRow = { product_id: string; sec_url: string };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const got = (req.headers["x-cron-secret"] as string | undefined) || "";
  if (got !== CRON_SECRET) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let offset = 0;

  // métricas
  let processed = 0;
  let resolved = 0;
  let updatedOffers = 0;
  let skippedNoChange = 0;
  let failed = 0;

  // coleta erros “por item”
  const failures: Array<{
    product_id?: string;
    sec_url?: string;
    error: string;
  }> = [];

  try {
    while (true) {
      const { data: rows, error } = await supabase
        .from("ml_link_import")
        .select("product_id, sec_url")
        .not("sec_url", "is", null)
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw new Error(error.message);
      if (!rows || rows.length === 0) break;

      // Dedup por product_id no batch (evita resolver o mesmo produto 2x)
      const uniq = new Map<string, string>();
      for (const r of rows as any[]) {
        if (!r?.product_id || !r?.sec_url) continue;
        if (!uniq.has(r.product_id)) uniq.set(r.product_id, r.sec_url);
      }
      const work: LinkRow[] = Array.from(uniq.entries()).map(([product_id, sec_url]) => ({
        product_id,
        sec_url,
      }));

      const { results, errors } = await runPool(work, MAX_CONCURRENCY, async (row) => {
        processed += 1;

        const mlb = await resolveSecToMLB(row.sec_url);
        resolved += 1;

        // Busca offers atuais pra decidir idempotência
        const { data: offers, error: selErr } = await supabase
          .from("store_offers")
          .select("id, external_id, is_active")
          .eq("platform", PLATFORM_LABEL)
          .eq("product_id", row.product_id);

        if (selErr) throw new Error(selErr.message);
        if (!offers || offers.length === 0) {
          // Sem offer pra esse produto: não é “erro”, só não atualiza nada.
          return { product_id: row.product_id, mlb, updated: 0, skipped: 0 };
        }

        const toUpdateIds = offers
          .filter((o: any) => (o.external_id ?? null) !== mlb || o.is_active !== true)
          .map((o: any) => o.id);

        if (toUpdateIds.length === 0) {
          skippedNoChange += 1;
          return { product_id: row.product_id, mlb, updated: 0, skipped: offers.length };
        }

        // Atualiza apenas as offers que precisam
        const { data: upd, error: upErr } = await supabase
          .from("store_offers")
          .update({ external_id: mlb, is_active: true })
          .in("id", toUpdateIds)
          .select("id");

        if (upErr) throw new Error(upErr.message);

        const count = upd?.length ?? 0;
        updatedOffers += count;

        return { product_id: row.product_id, mlb, updated: count, skipped: 0 };
      });

      // agrega erros do batch
      failed += errors.length;
      for (const e of errors) {
        const item = e.item as any;
        failures.push({
          product_id: item?.product_id,
          sec_url: item?.sec_url,
          error: (e.error as any)?.message || String(e.error),
        });
      }

      offset += BATCH_SIZE;
      if (rows.length < BATCH_SIZE) break;
    }

    // Cron SEMPRE retorna ok:true; falhas vão no payload (pipeline segue)
    return res.status(200).json({
      ok: true,
      processed,
      resolved,
      updatedOffers,
      skippedNoChange,
      failed,
      // evita payload gigante
      failures: failures.slice(0, 50),
      hasMoreFailures: failures.length > 50,
    });
  } catch (err: any) {
    // erro estrutural (db/env etc.)
    return res.status(500).json({ ok: false, error: err?.message || "Unknown error" });
  }
}

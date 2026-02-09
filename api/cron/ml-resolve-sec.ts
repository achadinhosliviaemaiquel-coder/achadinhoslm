import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

// ✅ Local/dev fallback (não usar em produção)
const COOKIE_FILE = process.env.ML_COOKIE_FILE || "./ml-cookie.json";
// ✅ Produção (Vercel): base64 do JSON do cookie (ex: {"cookie":"a=b; c=d"})
const COOKIE_B64 = process.env.ML_COOKIE_B64 || "";

const MAX_CONCURRENCY = Number(process.env.ML_RESOLVE_CONCURRENCY || "2");
const MAX_ITEMS = Number(process.env.ML_RESOLVE_MAX_ITEMS || "200");

// jitter default (ms)
const JITTER_MIN_MS = Number(process.env.ML_JITTER_MIN_MS || "120");
const JITTER_MAX_MS = Number(process.env.ML_JITTER_MAX_MS || "420");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

async function jitter() {
  await sleep(randInt(JITTER_MIN_MS, JITTER_MAX_MS));
}

function readHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function normalizeCookieHeader(cookie: string) {
  let s = (cookie || "").trim();
  s = s.replace(/^cookie\s*:\s*/i, "");
  s = s.replace(/[\r\n]+/g, " ").trim();
  s = s.replace(/\s{2,}/g, " ");
  return s;
}

function readCookieFromFile(): string {
  const p = path.resolve(process.cwd(), COOKIE_FILE);
  if (!fs.existsSync(p)) throw new Error(`ML_COOKIE_FILE not found: ${p}`);
  const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  const json = JSON.parse(raw) as { cookie?: string; cookie_base64?: string };

  let cookie = normalizeCookieHeader(json.cookie || "");
  if (!cookie && typeof json.cookie_base64 === "string") {
    cookie = normalizeCookieHeader(Buffer.from(json.cookie_base64, "base64").toString("utf8"));
  }

  if (!cookie) throw new Error("ML_COOKIE_FILE exists but cookie is empty");
  return cookie;
}

function readCookieFromB64(): string {
  const decoded = Buffer.from(COOKIE_B64, "base64").toString("utf8");
  // esperado: {"cookie":"a=b; c=d"}
  const json = JSON.parse(decoded) as { cookie?: string };
  const cookie = normalizeCookieHeader(json.cookie || "");
  if (!cookie) throw new Error("ML_COOKIE_B64 decoded but cookie is empty");
  return cookie;
}

/**
 * ✅ Regra:
 * - Se ML_COOKIE_B64 existir -> usa (produção / vercel)
 * - Senão -> fallback arquivo (localhost)
 */
function getCookie(): string {
  if (COOKIE_B64 && COOKIE_B64.trim()) {
    return readCookieFromB64();
  }
  return readCookieFromFile();
}

function buildHeaders(cookie: string) {
  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "upgrade-insecure-requests": "1",
    dnt: "1",
    referer: "https://www.mercadolivre.com.br/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    cookie,
  } as Record<string, string>;
}

function isBadUrl(url: string) {
  const s = (url || "").toLowerCase();
  return (
    s.includes("/social/") ||
    s.includes("forceinapp=true") ||
    s.includes("matt_tool=") ||
    s.includes("matt_word=") ||
    s.includes("matt_")
  );
}

function isSecUrl(url: string) {
  const s = (url || "").toLowerCase();
  return s.includes("/sec/");
}

/**
 * Extrai MLBU/MLB de qualquer string/URL:
 * - /p/MLB65193923
 * - MLB91339770982
 * - MLBU12345678
 * - MLB-98312000924 (vira MLB98312000924)
 */
function extractMlExternalId(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input);

  const mlbu = s.match(/(MLBU\d{6,14})/i)?.[1];
  if (mlbu) return mlbu.toUpperCase();

  const mlb = s.match(/(MLB\d{6,14})/i)?.[1];
  if (mlb) return mlb.toUpperCase();

  const mlbDash = s.match(/MLB-(\d{6,14})/i)?.[1];
  if (mlbDash) return `MLB${mlbDash}`;

  return null;
}

async function resolveFinalUrl(url: string, cookie: string) {
  await jitter();
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: buildHeaders(cookie),
  });

  const anyRes = res as any;
  const finalUrl = typeof anyRes.url === "string" && anyRes.url ? anyRes.url : url;

  return { res, finalUrl };
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
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

type ProductRow = {
  id: string;
  mercadolivre_link: string | null;
  source_url: string | null;
  is_active: boolean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-resolve-sec] ${new Date().toISOString()} ${s}`;
    logs.push(line);
    console.log(line);
  };

  try {
    const got = readHeader(req, "x-cron-secret");
    if (got !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const cookie = getCookie();
    log(`Cookie loaded from ${COOKIE_B64 ? "ML_COOKIE_B64" : `ML_COOKIE_FILE (${COOKIE_FILE})`}`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Pega products ativos com mercadolivre_link preenchido
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, mercadolivre_link, source_url, is_active")
      .eq("is_active", true)
      .not("mercadolivre_link", "is", null)
      .limit(MAX_ITEMS);

    if (pErr) throw new Error(`DB read products error: ${pErr.message}`);

    const targets = (products as ProductRow[]).filter((p) => {
      const url = (p.mercadolivre_link || "").trim();
      if (!url) return false;
      return isSecUrl(url) || isBadUrl(url);
    });

    log(`products scanned=${products?.length ?? 0} targets=${targets.length}`);

    let scanned = 0;
    let resolved = 0;
    let updatedProducts = 0;
    let upsertedOffers = 0;
    let failed = 0;

    let usedSourceUrlMlb = 0;
    let badFinalUrlCount = 0;
    let httpFailed = 0;
    let mlbMissing = 0;

    const { errors } = await runPool(targets, MAX_CONCURRENCY, async (p) => {
      scanned += 1;

      const original = (p.mercadolivre_link || "").trim();
      const sourceUrl = (p.source_url || "").trim() || null;

      const mlbFromSource = extractMlExternalId(sourceUrl);

      let finalUrl: string | null = null;

      try {
        const { res: r, finalUrl: f } = await resolveFinalUrl(original, cookie);

        if (!r.ok) {
          httpFailed += 1;
          log(`HTTP ${r.status} product=${p.id} url=${original}`);
        } else {
          if (isBadUrl(f) || f.toLowerCase().includes("/social/")) {
            badFinalUrlCount += 1;
            log(`BAD finalUrl product=${p.id} finalUrl=${f}`);
          } else {
            finalUrl = f;
          }
        }
      } catch (e: any) {
        httpFailed += 1;
        log(`FETCH error product=${p.id} url=${original} err=${String(e?.message || e)}`);
      }

      const mlbFromFinal = finalUrl ? extractMlExternalId(finalUrl) : null;
      const mlb = mlbFromFinal || mlbFromSource;

      if (!mlb) {
        mlbMissing += 1;
        failed += 1;
        log(
          `MLB not found product=${p.id} finalUrl=${finalUrl ?? "n/a"} source_url=${sourceUrl ?? "n/a"}`,
        );
        return;
      }

      if (mlbFromFinal) resolved += 1;
      else usedSourceUrlMlb += 1;

      if (finalUrl && finalUrl !== original) {
        const { error: upProdErr } = await supabase
          .from("products")
          .update({ mercadolivre_link: finalUrl })
          .eq("id", p.id);

        if (upProdErr) {
          failed += 1;
          log(`Update products failed product=${p.id}: ${upProdErr.message}`);
          return;
        }
        updatedProducts += 1;
      }

      const offerUrl = finalUrl || original;

      const { error: upsertErr } = await supabase.from("store_offers").upsert(
        {
          product_id: p.id,
          platform: PLATFORM_LABEL,
          external_id: mlb,
          url: offerUrl,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,platform" },
      );

      if (upsertErr) {
        failed += 1;
        log(`Upsert store_offers failed product=${p.id} mlb=${mlb} err=${upsertErr.message}`);
        return;
      }

      upsertedOffers += 1;
      log(`OK product=${p.id} mlb=${mlb} url=${offerUrl} (from ${mlbFromFinal ? "finalUrl" : "source_url"})`);
    });

    if (errors.length) {
      log(`Pool errors count=${errors.length}`);
    }

    return res.status(200).json({
      ok: true,
      scanned,
      targets: targets.length,

      resolvedFromFinalUrl: resolved,
      usedSourceUrlMlb,

      updatedProducts,
      upsertedOffers,

      failed,
      httpFailed,
      badFinalUrlCount,
      mlbMissing,

      concurrency: MAX_CONCURRENCY,
      cookieSource: COOKIE_B64 ? "ML_COOKIE_B64" : "ML_COOKIE_FILE",
      cookieFile: COOKIE_FILE,
      logs: logs.slice(-140),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}

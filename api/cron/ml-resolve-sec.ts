import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const COOKIE_FILE = process.env.ML_COOKIE_FILE || "./ml-cookie.json";
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
  const raw = fs.readFileSync(p, "utf8");
  const json = JSON.parse(raw) as { cookie?: string };
  const cookie = normalizeCookieHeader(json.cookie || "");
  if (!cookie) throw new Error("ML_COOKIE_FILE exists but cookie is empty");
  return cookie;
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
    s.includes("matt_word=")
  );
}

function isSecUrl(url: string) {
  const s = (url || "").toLowerCase();
  return s.includes("/sec/");
}

function extractMLB(url: string): string | null {
  const m = url.match(/MLB\d+/i);
  return m ? m[0].toUpperCase() : null;
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
  is_active: boolean;
};

type StoreOfferRow = {
  id: number;
  product_id: string;
  platform: string;
  external_id: string | null;
  url: string | null;
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

    const cookie = readCookieFromFile();
    log(`Cookie loaded from ML_COOKIE_FILE (${COOKIE_FILE})`);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Pega products ativos com mercadolivre_link “suspeito”
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, mercadolivre_link, is_active")
      .eq("is_active", true)
      .not("mercadolivre_link", "is", null)
      .limit(MAX_ITEMS);

    if (pErr) throw new Error(`DB read products error: ${pErr.message}`);

    const targets = (products as ProductRow[]).filter((p) => {
      const url = (p.mercadolivre_link || "").trim();
      if (!url) return false;
      // resolve se for /sec/ ou se for URL “suja”
      return isSecUrl(url) || isBadUrl(url);
    });

    log(`products scanned=${products?.length ?? 0} targets=${targets.length}`);

    let scanned = 0;
    let resolved = 0;
    let updatedProducts = 0;
    let updatedOffers = 0;
    let failed = 0;
    let gateDetected = 0;

    const { errors } = await runPool(targets, MAX_CONCURRENCY, async (p) => {
      scanned += 1;

      const original = (p.mercadolivre_link || "").trim();
      if (!original) return;

      const { res: r, finalUrl } = await resolveFinalUrl(original, cookie);

      if (!r.ok) {
        failed += 1;
        log(`HTTP ${r.status} product=${p.id} url=${original}`);
        return;
      }

      // Se final ainda caiu em social/app tracking, marca como “gate/sujo”
      if (isBadUrl(finalUrl) || finalUrl.toLowerCase().includes("/social/")) {
        gateDetected += 1;
        log(`BAD finalUrl product=${p.id} finalUrl=${finalUrl}`);
        return;
      }

      const mlb = extractMLB(finalUrl);
      if (!mlb) {
        failed += 1;
        log(`MLB not found product=${p.id} finalUrl=${finalUrl}`);
        return;
      }

      resolved += 1;

      // 2) Atualiza products.mercadolivre_link para URL final limpa
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

      // 3) Atualiza/insere store_offers (por product_id + platform)
      const { data: existing, error: exErr } = await supabase
        .from("store_offers")
        .select("id, product_id, platform, external_id, url, is_active")
        .eq("product_id", p.id)
        .eq("platform", PLATFORM_LABEL)
        .maybeSingle<StoreOfferRow>();

      if (exErr) {
        failed += 1;
        log(`Read store_offers failed product=${p.id}: ${exErr.message}`);
        return;
      }

      if (existing?.id) {
        const { error: upOffErr } = await supabase
          .from("store_offers")
          .update({
            external_id: mlb,
            url: finalUrl,
            is_active: true,
          })
          .eq("id", existing.id);

        if (upOffErr) {
          failed += 1;
          log(`Update store_offers failed offer=${existing.id}: ${upOffErr.message}`);
          return;
        }
        updatedOffers += 1;
      } else {
        const { error: insErr } = await supabase
          .from("store_offers")
          .insert({
            product_id: p.id,
            platform: PLATFORM_LABEL,
            external_id: mlb,
            url: finalUrl,
            is_active: true,
          });

        if (insErr) {
          failed += 1;
          log(`Insert store_offers failed product=${p.id}: ${insErr.message}`);
          return;
        }
        updatedOffers += 1;
      }

      log(`OK product=${p.id} mlb=${mlb}`);
    });

    if (errors.length) {
      log(`Pool errors count=${errors.length}`);
    }

    return res.status(200).json({
      ok: true,
      scanned,
      targets: targets.length,
      resolved,
      updatedProducts,
      updatedOffers,
      failed,
      gateDetected,
      concurrency: MAX_CONCURRENCY,
      cookieFile: COOKIE_FILE,
      logs: logs.slice(-120),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}

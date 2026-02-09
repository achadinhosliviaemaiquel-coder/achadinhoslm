import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

type StoreOffer = {
  id: number;
  product_id: string;
  platform: string;
  external_id: string | null; // MLBxxxx / MLBUxxxx (se existir)
  url: string | null;
  is_active: boolean;
};

type ImportRow = { product_id: string; sec_url: string | null };

type JobCounters = {
  scanned: number;
  updated: number;
  failed: number;
  http429: number;
  retries: number;
  unavailableDeactivated: number;
  missingSecUrlSkipped: number;
  invalidExternalIdSkipped: number;
  cookieMissingOrExpired: number; // aqui significa gate/captcha/login
  priceNotFound: number;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";
const BATCH_SIZE = Number(process.env.ML_PRICE_BATCH_SIZE || "150");
const MAX_CONCURRENCY = Number(process.env.ML_PRICE_CONCURRENCY || "2");
const MAX_RETRIES = Number(process.env.ML_PRICE_MAX_RETRIES || "2");
const BOT_FAILFAST_THRESHOLD = Number(
  process.env.ML_PRICE_BOT_FAILFAST_THRESHOLD || "8",
);

const COOKIE_FILE = process.env.ML_COOKIE_FILE || "./ml-cookie.json";

// ✅ valida cookie em /p/ (mais estável que homepage)
const COOKIE_TEST_URL =
  process.env.ML_COOKIE_TEST_URL ||
  "https://www.mercadolivre.com.br/p/MLB19698479";

// jitter default (ms)
const JITTER_MIN_MS = Number(process.env.ML_JITTER_MIN_MS || "120");
const JITTER_MAX_MS = Number(process.env.ML_JITTER_MAX_MS || "420");

function utcDateString(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function utcDateOnly(d = new Date()): string {
  return utcDateString(d);
}

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

type MlExternalId = { prefix: "MLB" | "MLBU"; digits: string; raw: string };

function parseMlExternalId(externalId: string | null): MlExternalId | null {
  if (!externalId) return null;
  const m = externalId.match(/^(MLBU|MLB)(\d{6,14})$/i);
  if (!m) return null;
  const prefix = m[1].toUpperCase() as "MLB" | "MLBU";
  const digits = m[2];
  return { prefix, digits, raw: `${prefix}${digits}` };
}

function isValidMLB(externalId: string | null): externalId is string {
  return !!parseMlExternalId(externalId);
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

  // ✅ remove BOM caso editor salve com BOM
  const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");

  let json: any;
  try {
    json = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`ML_COOKIE_FILE invalid JSON: ${e?.message || e}`);
  }

  // aceita cookie direto
  let cookie = typeof json.cookie === "string" ? json.cookie : "";

  // ou cookie em base64
  if (!cookie && typeof json.cookie_base64 === "string") {
    cookie = Buffer.from(json.cookie_base64, "base64").toString("utf8");
  }

  cookie = normalizeCookieHeader(cookie || "");
  if (!cookie) throw new Error("ML_COOKIE_FILE exists but cookie is empty");

  return cookie;
}

function buildBrowserHeaders(cookie: string) {
  return {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "upgrade-insecure-requests": "1",
    dnt: "1",
    referer: "https://www.mercadolivre.com.br/",

    // ✅ ajuda contra WAFs (fingerprint básico)
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "navigate",
    "sec-fetch-dest": "document",
    "sec-fetch-user": "?1",
    "sec-ch-ua":
      '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',

    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    cookie,
  } as Record<string, string>;
}

/**
 * ⚠️ "Gate" real (captcha/login/WAF) vs falso positivo.
 * Homepage pode conter strings "captcha" em scripts: valida cookie em /p/ e usa heurística mais dura.
 */
function isHardGate(html: string, finalUrl: string) {
  const s = html.toLowerCase();

  const urlSignals =
    /\/(authorization|auth|login)\b/i.test(finalUrl) ||
    /\/(ingreso|entrar)\b/i.test(finalUrl);

  const hardSignals =
    s.includes("hcaptcha") ||
    s.includes("g-recaptcha") ||
    s.includes("recaptcha") ||
    s.includes("datadome") ||
    s.includes("access denied") ||
    s.includes("verify you are human") ||
    (s.includes("verifique") && (s.includes("robô") || s.includes("robo"))) ||
    s.includes("não sou um robô");

  return urlSignals || hardSignals;
}

function looksLikeRealMlPage(html: string) {
  return (
    html.includes("__NEXT_DATA__") ||
    html.toLowerCase().includes("mercadolivre") ||
    /<title[^>]*>[\s\S]*<\/title>/i.test(html)
  );
}

async function validateCookie(cookie: string, log: (s: string) => void) {
  const testUrl = COOKIE_TEST_URL;

  log(`Validating cookie using testUrl=${testUrl}`);

  // pequeno jitter antes do teste
  await jitter();

  const res = await fetch(testUrl, {
    method: "GET",
    headers: buildBrowserHeaders(cookie),
    redirect: "follow",
  });

  const anyRes = res as any;
  const finalUrl =
    typeof anyRes.url === "string" && anyRes.url ? anyRes.url : testUrl;

  const html = await res.text();
  const title = shortTitle(html);

  if (!res.ok) {
    // não conclui cookie inválido só por HTTP != 200
    log(
      `Cookie validation HTTP ${res.status} title=${title ?? "n/a"} finalUrl=${finalUrl}`,
    );
    return;
  }

  // se for gate "hard" e não parecer página real, aí sim invalidar
  if (isHardGate(html, finalUrl) && !looksLikeRealMlPage(html)) {
    log(
      `Cookie validation HARD-GATE title=${title ?? "n/a"} finalUrl=${finalUrl}`,
    );
    throw new Error(
      "ML cookie is invalid or expired (hard gate detected on test page)",
    );
  }

  log(`Cookie validation OK title=${title ?? "n/a"} finalUrl=${finalUrl}`);
}

const FETCH_TIMEOUT_MS = Number(process.env.ML_FETCH_TIMEOUT_MS || "25000");

async function fetchWithRetryHtml(
  url: string,
  job: JobCounters,
  maxRetries: number,
  cookie: string,
  log: (s: string) => void,
) {
  let attempt = 0;
  let backoff = 700;

  while (true) {
    await jitter();

    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: buildBrowserHeaders(cookie),
        signal: ac.signal,
      });
    } catch (e: any) {
      clearTimeout(to);

      const msg = String(e?.name || e?.message || e);
      log(`FETCH error (${msg}) url=${url}`);

      if (attempt >= maxRetries) throw e;

      job.retries += 1;
      await sleep(Math.min(backoff + randInt(100, 600), 12000));
      attempt += 1;
      backoff *= 2;
      continue;
    } finally {
      clearTimeout(to);
    }

    if (res.status === 429) {
      job.http429 += 1;
      log(`HTTP 429 url=${url}`);
      if (attempt >= maxRetries) return res;

      job.retries += 1;
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : backoff;
      await sleep(Math.min(waitMs + randInt(100, 600), 12000));
      attempt += 1;
      backoff *= 2;
      continue;
    }

    if (res.status >= 500 && res.status <= 599) {
      log(`HTTP ${res.status} (5xx) url=${url}`);
      if (attempt >= maxRetries) return res;

      job.retries += 1;
      await sleep(Math.min(backoff + randInt(100, 600), 12000));
      attempt += 1;
      backoff *= 2;
      continue;
    }

    return res;
  }
}

function safeJsonParse<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function parseNumberLoose(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;

  let s = v.replace(/\s+/g, " ").replace(/[R$\u00A0]/g, "").trim();

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else {
    s = s.replace(/,/g, "");
  }

  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;

  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function extractNextData(html: string): any | null {
  const re = /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i;
  const m = html.match(re);
  if (!m?.[1]) return null;
  return safeJsonParse(m[1].trim());
}

function extractJsonLdBlocks(html: string): any[] {
  const blocks: any[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    const parsed = safeJsonParse(raw);
    if (parsed) blocks.push(parsed);
  }
  return blocks;
}

function extractPreloadedState(html: string): any | null {
  const re = /__PRELOADED_STATE__\s*=\s*({[\s\S]*?})\s*;?\s*<\/script>/i;
  const m = html.match(re);
  if (!m?.[1]) return null;
  return safeJsonParse(m[1]);
}

function extractMetaPrice(html: string) {
  const priceM = html.match(
    /<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  const curM = html.match(
    /<meta[^>]+itemprop=["']priceCurrency["'][^>]+content=["']([^"']+)["'][^>]*>/i,
  );
  const price = priceM?.[1] ? parseNumberLoose(priceM[1]) : null;
  const currency = curM?.[1] ?? null;
  return { price, currency };
}

function extractProductOfferFromJsonLd(block: any) {
  const candidates = Array.isArray(block) ? block : [block];

  for (const node of candidates) {
    if (!node || typeof node !== "object") continue;

    const type = (node as any)["@type"];
    const isProduct =
      type === "Product" || (Array.isArray(type) && type.includes("Product"));
    if (!isProduct) continue;

    const offers = (node as any).offers;
    const offerList = Array.isArray(offers) ? offers : offers ? [offers] : [];

    for (const off of offerList) {
      if (!off || typeof off !== "object") continue;

      const p =
        parseNumberLoose((off as any).price ?? (off as any).lowPrice ?? null) ??
        null;
      if (p === null) continue;

      const cur =
        typeof (off as any).priceCurrency === "string"
          ? (off as any).priceCurrency
          : typeof (node as any).priceCurrency === "string"
            ? (node as any).priceCurrency
            : null;

      const original =
        parseNumberLoose(
          (off as any).highPrice ?? (off as any).original_price,
        ) ?? null;

      return {
        price: p,
        original,
        currency: cur,
        detail: "jsonld:Product.offers.price",
      };
    }
  }

  return null;
}

function deepFindPrice(obj: any): {
  price: number | null;
  original: number | null;
  currency: string | null;
} {
  const stack: any[] = [obj];
  const seen = new Set<any>();

  while (stack.length) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);

    if (Array.isArray(cur)) {
      for (const it of cur) stack.push(it);
      continue;
    }

    const priceRaw =
      (cur as any).price ??
      (cur as any).amount ??
      (cur as any).current_price ??
      null;

    const currency =
      (cur as any).currency_id ??
      (cur as any).priceCurrency ??
      (cur as any).currency ??
      null;

    const original =
      (cur as any).original_price ??
      (cur as any).originalPrice ??
      (cur as any).base_price ??
      (cur as any).old_price ??
      null;

    const p = parseNumberLoose(priceRaw);
    if (p !== null) {
      return {
        price: p,
        original: parseNumberLoose(original),
        currency: typeof currency === "string" ? currency : null,
      };
    }

    for (const k of Object.keys(cur)) stack.push((cur as any)[k]);
  }

  return { price: null, original: null, currency: null };
}

function extractPriceFromHtml(html: string) {
  const meta = extractMetaPrice(html);
  if (meta.price !== null) {
    return {
      price: meta.price,
      original: null,
      currency: meta.currency ?? "BRL",
      evidence: "meta" as const,
      evidence_detail: "meta[itemprop=price]" as const,
    };
  }

  for (const block of extractJsonLdBlocks(html)) {
    const found = extractProductOfferFromJsonLd(block);
    if (found?.price !== null) {
      return {
        price: found.price,
        original: found.original,
        currency: found.currency ?? "BRL",
        evidence: "jsonld" as const,
        evidence_detail: found.detail as const,
      };
    }
  }

  const next = extractNextData(html);
  if (next) {
    const found = deepFindPrice(next);
    if (found.price !== null) {
      return {
        ...found,
        currency: found.currency ?? "BRL",
        evidence: "__NEXT_DATA__" as const,
        evidence_detail: "deepFindPrice(__NEXT_DATA__)" as const,
      };
    }
  }

  const pre = extractPreloadedState(html);
  if (pre) {
    const found = deepFindPrice(pre);
    if (found.price !== null) {
      return {
        ...found,
        currency: found.currency ?? "BRL",
        evidence: "__PRELOADED_STATE__" as const,
        evidence_detail: "deepFindPrice(__PRELOADED_STATE__)" as const,
      };
    }
  }

  const money = html.match(/R\$\s*([0-9]{1,3}(\.[0-9]{3})*,[0-9]{2})/);
  if (money?.[1]) {
    const p = parseNumberLoose(money[1]);
    if (p !== null) {
      return {
        price: p,
        original: null,
        currency: "BRL",
        evidence: "regex_brl" as const,
        evidence_detail: "regex:R$" as const,
      };
    }
  }

  return {
    price: null as number | null,
    original: null as number | null,
    currency: null as string | null,
    evidence: "none" as const,
    evidence_detail: "none" as const,
  };
}

function looksLikeLoginOrBot(html: string, finalUrl: string) {
  const s = html.toLowerCase();

  const botSignals =
    s.includes("hcaptcha") ||
    s.includes("g-recaptcha") ||
    s.includes("recaptcha") ||
    s.includes("captcha") ||
    s.includes("challenge") ||
    s.includes("datadome") ||
    s.includes("access denied") ||
    (s.includes("verifique") && (s.includes("robô") || s.includes("robo"))) ||
    s.includes("não sou um robô");

  const loginSignals =
    s.includes("iniciar sessão") ||
    s.includes("inicie sessão") ||
    s.includes("entrar na sua conta") ||
    (s.includes("identificação") && s.includes("e-mail")) ||
    s.includes("ingresar") ||
    s.includes("iniciar sesion");

  const urlSignals =
    /\/(authorization|auth|login)\b/i.test(finalUrl) ||
    /\/(ingreso|entrar)\b/i.test(finalUrl);

  return botSignals || loginSignals || urlSignals;
}

function isBadUrl(url: string) {
  const s = (url || "").toLowerCase();
  return (
    s.includes("/social/") ||
    s.includes("/sec/") ||
    s.includes("forceinapp=true") ||
    s.includes("matt_tool=") ||
    s.includes("matt_word=")
  );
}

/**
 * Remove tracking “matt_*”, forceInApp, ref etc.
 */
function cleanMlUrl(input: string): string | null {
  try {
    const u = new URL(input);

    const kill = [
      "forceInApp",
      "forceinapp",
      "ref",
      "matt_tool",
      "matt_word",
      "matt_campaign",
      "matt_source",
      "matt_custom",
      "matt_ad_id",
      "matt_adset_id",
      "matt_platform",
    ];

    for (const k of kill) u.searchParams.delete(k);

    for (const [k] of Array.from(u.searchParams.entries())) {
      if (k.toLowerCase().startsWith("matt_")) u.searchParams.delete(k);
    }

    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * ✅ tenta múltiplos formatos que o ML usa
 * Ajuste importante:
 * - Para MLB (item/anúncio), prioriza MLB-<digits> (produto.mercadolivre.com.br e mercadolivre.com.br)
 * - /p/ pode funcionar (catálogo), mas nem sempre existe
 * - /up/ é útil mais para MLBU; para MLB geralmente é ruído
 */
function mlCandidateUrls(externalId: string) {
  const parsed = parseMlExternalId(externalId);
  if (!parsed) return [];

  const { prefix, digits, raw } = parsed;

  const urls: string[] = [];

  if (prefix === "MLB") {
    // ✅ melhor chance para MLB longos
    urls.push(`https://produto.mercadolivre.com.br/MLB-${digits}`);
    urls.push(`https://www.mercadolivre.com.br/MLB-${digits}`);

    // catálogo (quando existir)
    urls.push(`https://www.mercadolivre.com.br/p/${raw}`);

    // fallback
    urls.push(`https://www.mercadolivre.com.br/${raw}`);
  } else {
    // MLBU (quando você tiver): /up/ costuma ser mais relevante
    urls.push(`https://www.mercadolivre.com.br/up/${raw}`);
    urls.push(`https://www.mercadolivre.com.br/p/${raw}`);
    urls.push(`https://produto.mercadolivre.com.br/${raw}-${digits}`); // fallback defensivo
    urls.push(`https://www.mercadolivre.com.br/${raw}`);
  }

  return urls;
}

function shortTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m?.[1]?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 140) : null;
}

function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

function hasStrongPrice(found: ReturnType<typeof extractPriceFromHtml>) {
  return (
    found.price !== null &&
    found.price > 0 &&
    (found.evidence === "meta" ||
      found.evidence === "jsonld" ||
      found.evidence === "__NEXT_DATA__" ||
      found.evidence === "__PRELOADED_STATE__")
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-prices] ${new Date().toISOString()} ${s}`;
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

    await validateCookie(cookie, log);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const job: JobCounters = {
      scanned: 0,
      updated: 0,
      failed: 0,
      http429: 0,
      retries: 0,
      unavailableDeactivated: 0,
      missingSecUrlSkipped: 0,
      invalidExternalIdSkipped: 0,
      cookieMissingOrExpired: 0,
      priceNotFound: 0,
    };

    const snapshotDate = utcDateString(new Date());

    const { data: runRow, error: runErr } = await supabase
      .from("price_job_runs")
      .insert({
        platform: PLATFORM_LABEL,
        status: "running",
        started_at: new Date().toISOString(),
        stats: {
          snapshotDate,
          batchSize: BATCH_SIZE,
          concurrency: MAX_CONCURRENCY,
          mode: "html-cookie-file",
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
    let lastErrorSample: string | null = null;

    // (mantido; hoje não é usado no fluxo, mas pode ser útil depois)
    const { data: imports, error: impErr } = await supabase
      .from("ml_link_import")
      .select("product_id, sec_url");
    if (impErr) throw new Error(`DB read ml_link_import error: ${impErr.message}`);

    const secByProduct = new Map<string, string>();
    for (const row of (imports ?? []) as ImportRow[]) {
      if (row.product_id && row.sec_url) secByProduct.set(row.product_id, row.sec_url);
    }

    let offset = 0;
    let shouldStopEarly = false;

    while (true) {
      const { data: offers, error } = await supabase
        .from("store_offers")
        .select("id, product_id, platform, external_id, url, is_active")
        .eq("platform", PLATFORM_LABEL)
        .eq("is_active", true)
        .order("id", { ascending: true })
        .range(offset, offset + BATCH_SIZE - 1);

      if (error) throw new Error(`DB read store_offers error: ${error.message}`);
      if (!offers || offers.length === 0) break;

      const filtered = (offers as StoreOffer[]).filter((o) => {
        const ok = isValidMLB(o.external_id);
        if (!ok) job.invalidExternalIdSkipped += 1;
        return ok;
      });

      job.scanned += filtered.length;
      log(`Batch offset=${offset} offers=${offers.length} filtered=${filtered.length}`);

      const { errors: poolErrors } = await runPool(
        filtered,
        MAX_CONCURRENCY,
        async (offer) => {
          if (shouldStopEarly) return;

          const externalId = offer.external_id!;
          const parsed = parseMlExternalId(externalId);
          if (!parsed) return;

          const label = parsed.raw; // MLBxxxx / MLBUxxxx

          const urlRaw = offer.url?.trim() || null;
          const urlClean = urlRaw ? cleanMlUrl(urlRaw) : null;

          const candidates: string[] = [];
          if (urlRaw) candidates.push(urlRaw);
          if (urlClean && urlClean !== urlRaw) candidates.push(urlClean);

          candidates.push(...mlCandidateUrls(label));

          const seen = new Set<string>();
          const candidateUrls = candidates.filter((u) => {
            if (!u) return false;
            const key = u.trim();
            if (!key) return false;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          // log útil p/ debugar os 7 que ficam null
          log(`Candidates id=${offer.id} ext=${label} count=${candidateUrls.length}`);

          let bestHtml: string | null = null;
          let bestFinalUrl: string | null = null;
          let bestFetchUrl: string | null = null;
          let bestFound: ReturnType<typeof extractPriceFromHtml> | null = null;

          for (const fetchUrl of candidateUrls) {
            if (isBadUrl(fetchUrl)) {
              log(`Trying tracked url ext=${label} url=${fetchUrl}`);
            }

            const pageRes = await fetchWithRetryHtml(
              fetchUrl,
              job,
              MAX_RETRIES,
              cookie,
              log,
            );

            const anyRes = pageRes as any;
            const finalUrl =
              typeof anyRes.url === "string" && anyRes.url ? anyRes.url : fetchUrl;

            if (!pageRes.ok) continue;

            const html = await pageRes.text();

            // ✅ título / social-profile precisam ser calculados por resposta
            const title = shortTitle(html);
            const isSocialProfile =
              /\/social\//i.test(finalUrl) ||
              /perfil social/i.test(title ?? "") ||
              /maaiquels/i.test(title ?? "");

            const extracted = extractPriceFromHtml(html);

            if (!hasStrongPrice(extracted) && looksLikeLoginOrBot(html, finalUrl)) {
              if (isSocialProfile) {
                log(
                  `Ignoring social-profile gate ext=${label} title=${title ?? "n/a"} url=${finalUrl}`,
                );
                continue;
              }

              job.cookieMissingOrExpired += 1;

              const msg = `GATE detected ext=${label} title=${title ?? "n/a"} url=${finalUrl}`;
              if (!lastErrorSample) lastErrorSample = msg.slice(0, 500);
              log(msg);

              if (job.cookieMissingOrExpired >= BOT_FAILFAST_THRESHOLD) {
                shouldStopEarly = true;
                log(
                  `Failfast: gateCount=${job.cookieMissingOrExpired} threshold=${BOT_FAILFAST_THRESHOLD}`,
                );
                return;
              }
              continue;
            }

            if (extracted.evidence === "regex_brl") continue;

            if (extracted.price !== null && extracted.price > 0) {
              bestHtml = html;
              bestFinalUrl = finalUrl;
              bestFetchUrl = fetchUrl;
              bestFound = extracted;

              if (hasStrongPrice(extracted)) break;
            }
          }

          if (!bestHtml || !bestFound || !bestFinalUrl || !bestFetchUrl) {
            job.priceNotFound += 1;
            const msg = `Price not found in any ML path ext=${label} offerId=${offer.id}`;
            if (!lastErrorSample) lastErrorSample = msg.slice(0, 500);
            log(msg);
            return;
          }

          const now = new Date();
          const nowIso = now.toISOString();
          const verifiedDate = utcDateOnly(now);
          const currency_id = bestFound.currency ?? "BRL";

          const raw = {
            source: "html",
            evidence: bestFound.evidence,
            evidence_detail: bestFound.evidence_detail,
            fetchUrl: bestFetchUrl,
            finalUrl: bestFinalUrl,
            title: shortTitle(bestHtml),
            body_sha1: sha1(bestHtml),
            extracted_at: nowIso,
            mode: "cookie_file",
          };

          // ⚠️ Mantive seu comportamento: PK offer_id = externalId (MLB/MLBU)
          const { error: upErr } = await supabase
            .from("offer_last_price")
            .upsert(
              {
                offer_id: label, // TEXT PK
                price: bestFound.price!,
                original_price: bestFound.original,
                currency_id,
                is_available: true,
                verified_at: nowIso,
                verified_date: verifiedDate,
                updated_at: nowIso,
                last_checked_at: nowIso,
                raw,
              },
              { onConflict: "offer_id" },
            );

          if (upErr) {
            job.failed += 1;
            throw new Error(
              `Upsert offer_last_price failed ext=${label}: ${upErr.message}`,
            );
          }

          const priceCents = Math.round(bestFound.price! * 100);

          const { error: soErr } = await supabase
            .from("store_offers")
            .update({
              current_price_cents: priceCents,
              current_price_updated_at: nowIso,
              url: bestFinalUrl, // ✅ canoniza
            })
            .eq("id", offer.id);

          if (soErr) {
            job.failed += 1;
            throw new Error(
              `Update store_offers failed ext=${label}: ${soErr.message}`,
            );
          }

          const { error: prodErr } = await supabase
            .from("products")
            .update({
              mercadolivre_price: bestFound.price!,
              updated_at: nowIso,
            })
            .eq("id", offer.product_id);

          if (prodErr) {
            job.failed += 1;
            throw new Error(
              `Update products.mercadolivre_price failed ext=${label}: ${prodErr.message}`,
            );
          }

          job.updated += 1;
          log(
            `OK ext=${label} price=${bestFound.price} via=${bestFetchUrl} final=${bestFinalUrl} currency=${currency_id}`,
          );
        },
      );

      // ✅ contar erros do pool como falhas
      if (poolErrors.length > 0) {
        job.failed += poolErrors.length;
        if (!lastErrorSample) {
          lastErrorSample = String(
            poolErrors[0] instanceof Error ? poolErrors[0].message : poolErrors[0],
          ).slice(0, 500);
        }
      }

      offset += BATCH_SIZE;
      if (shouldStopEarly) break;
      if (offers.length < BATCH_SIZE) break;
    }

    const durationMs = Date.now() - t0;

    const hadIncidents =
      job.failed > 0 ||
      job.unavailableDeactivated > 0 ||
      job.missingSecUrlSkipped > 0 ||
      job.invalidExternalIdSkipped > 0 ||
      job.cookieMissingOrExpired > 0 ||
      job.priceNotFound > 0;

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
          unavailableDeactivated: job.unavailableDeactivated,
          missingSecUrlSkipped: job.missingSecUrlSkipped,
          invalidExternalIdSkipped: job.invalidExternalIdSkipped,
          cookieMissingOrExpired: job.cookieMissingOrExpired,
          priceNotFound: job.priceNotFound,
          http429: job.http429,
          retries: job.retries,
          durationMs,
          mode: "html-cookie-file",
          stoppedEarly: shouldStopEarly,
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
      scanned: job.scanned,
      updated: job.updated,
      failed: job.failed,
      http429: job.http429,
      retries: job.retries,
      missingSecUrlSkipped: job.missingSecUrlSkipped,
      invalidExternalIdSkipped: job.invalidExternalIdSkipped,
      cookieMissingOrExpired: job.cookieMissingOrExpired,
      priceNotFound: job.priceNotFound,
      durationMs,
      errorSample: lastErrorSample,
      mode: "html-cookie-file",
      stoppedEarly: shouldStopEarly,
      logs: logs.slice(-160),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}

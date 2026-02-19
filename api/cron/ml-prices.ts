// api/cron/ml-prices.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import fs from "fs";
import path from "path";

type StoreOffer = {
  id: number;
  product_id: string;
  platform: string;
  external_id: string | null; // MLBxxxx / MLBUxxxx
  url: string | null;
  is_active: boolean;
  current_price_cents?: number | null;
};

type JobCounters = {
  scanned: number; // quantos offers efetivamente tentamos processar (1 por offer)
  updated: number;
  failed: number;
  http429: number;
  retries: number;
  unavailableDeactivated: number;
  missingSecUrlSkipped: number;
  invalidExternalIdSkipped: number;
  cookieMissingOrExpired: number;
  priceNotFound: number;
  timedOut: number;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

// defaults seguros para serverless
const DEFAULT_LIMIT = Number(process.env.ML_PRICE_BATCH_SIZE || "10"); // <- não use 150 em serverless
const MAX_CONCURRENCY = Number(process.env.ML_PRICE_CONCURRENCY || "1");
const MAX_RETRIES = Number(process.env.ML_PRICE_MAX_RETRIES || "1");
const BOT_FAILFAST_THRESHOLD = Number(
  process.env.ML_PRICE_BOT_FAILFAST_THRESHOLD || "3",
);

// cookie
const COOKIE_FILE = process.env.ML_COOKIE_FILE || "./ml-cookie.json";
const COOKIE_B64 = process.env.ML_COOKIE_B64 || "";
const COOKIE_TEST_URL =
  process.env.ML_COOKIE_TEST_URL ||
  "https://www.mercadolivre.com.br/p/MLB19698479";

// jitter / timeouts
const JITTER_MIN_MS = Number(process.env.ML_JITTER_MIN_MS || "80");
const JITTER_MAX_MS = Number(process.env.ML_JITTER_MAX_MS || "220");
const FETCH_TIMEOUT_MS = Number(process.env.ML_FETCH_TIMEOUT_MS || "8000");

// budget de execução (antes da Vercel matar)
const MAX_RUN_MS = Number(process.env.ML_PRICE_MAX_RUN_MS || "45000"); // 45s

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

function readCronSecret(req: VercelRequest): string {
  const h = readHeader(req, "x-cron-secret");
  if (h) return h;

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

function readCookieFromEnvOrFile(): { cookie: string; source: "b64" | "file" } {
  if (COOKIE_B64 && COOKIE_B64.trim()) {
    let parsed: any;
    try {
      const jsonStr = Buffer.from(COOKIE_B64, "base64").toString("utf8");
      parsed = JSON.parse(jsonStr);
    } catch (e: any) {
      throw new Error(`ML_COOKIE_B64 invalid base64/json: ${e?.message || e}`);
    }

    let cookie = typeof parsed.cookie === "string" ? parsed.cookie : "";
    if (!cookie && typeof parsed.cookie_base64 === "string") {
      cookie = Buffer.from(parsed.cookie_base64, "base64").toString("utf8");
    }

    cookie = normalizeCookieHeader(cookie || "");
    if (!cookie) throw new Error("ML_COOKIE_B64 provided but cookie is empty");
    return { cookie, source: "b64" };
  }

  const p = path.resolve(process.cwd(), COOKIE_FILE);
  if (!fs.existsSync(p)) throw new Error(`ML_COOKIE_FILE not found: ${p}`);

  const raw = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`ML_COOKIE_FILE invalid JSON: ${e?.message || e}`);
  }

  let cookie = typeof json.cookie === "string" ? json.cookie : "";
  if (!cookie && typeof json.cookie_base64 === "string") {
    cookie = Buffer.from(json.cookie_base64, "base64").toString("utf8");
  }

  cookie = normalizeCookieHeader(cookie || "");
  if (!cookie) throw new Error("ML_COOKIE_FILE exists but cookie is empty");
  return { cookie, source: "file" };
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

function shortTitle(html: string) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const t = m?.[1]?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 140) : null;
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

// NÃO vamos tentar /sec/ (isso é tracking e normalmente cai em social)
function isSecUrl(url: string) {
  return (url || "").toLowerCase().includes("/sec/");
}

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

function mlCandidateUrls(externalId: string) {
  const parsed = parseMlExternalId(externalId);
  if (!parsed) return [];

  const { prefix, digits, raw } = parsed;
  const urls: string[] = [];

  if (prefix === "MLB") {
    // mais confiáveis primeiro
    urls.push(`https://produto.mercadolivre.com.br/MLB-${digits}`);
    urls.push(`https://www.mercadolivre.com.br/MLB-${digits}`);
    urls.push(`https://www.mercadolivre.com.br/p/${raw}`);
  } else {
    urls.push(`https://www.mercadolivre.com.br/up/${raw}`);
    urls.push(`https://www.mercadolivre.com.br/p/${raw}`);
  }

  return urls;
}

function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
}

async function fetchWithRetryHtml(
  url: string,
  job: JobCounters,
  maxRetries: number,
  cookie: string,
  _log: (s: string) => void,
  deadlineMs: number,
) {
  let attempt = 0;
  let backoff = 400;

  while (true) {
    if (Date.now() > deadlineMs) throw new Error("TIME_BUDGET_EXCEEDED");

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
      if (attempt >= maxRetries) throw e;

      job.retries += 1;
      await sleep(Math.min(backoff + randInt(50, 250), 2500));
      attempt += 1;
      backoff *= 2;
      continue;
    } finally {
      clearTimeout(to);
    }

    if (res.status === 429) {
      job.http429 += 1;
      if (attempt >= maxRetries) return res;

      job.retries += 1;
      const retryAfter = res.headers.get("retry-after");
      const waitMs = retryAfter ? Number(retryAfter) * 1000 : backoff;
      await sleep(Math.min(waitMs + randInt(50, 250), 2500));
      attempt += 1;
      backoff *= 2;
      continue;
    }

    if (res.status >= 500 && res.status <= 599) {
      if (attempt >= maxRetries) return res;

      job.retries += 1;
      await sleep(Math.min(backoff + randInt(50, 250), 2500));
      attempt += 1;
      backoff *= 2;
      continue;
    }

    return res;
  }
}

// ---------- parsing de preço ----------
function safeJsonParse<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function sanitizeMlPriceCents(args: {
  computedCents: number;
  prevCents?: number | null;
}): number {
  let cents = args.computedCents;
  const prev = args.prevCents ?? null;

  // Se o preço for absurdamente grande (provavelmente double-scale)
  if (cents >= 500_000 && cents % 100 === 0) {
    cents = Math.round(cents / 100);
  }

  // Se tiver preço anterior e o novo for ~metade, desconfia
  if (prev && prev > 0 && cents > 0) {
    const ratio = cents / prev;
    if (ratio > 0.45 && ratio < 0.55) {
      // provavelmente pegou preço de parcela → usa o anterior como referência
      log(
        `[WARN] Possible parcel price detected: ${cents / 100} vs previous ${prev / 100}`,
      );
      return prev; // mantém o preço anterior
    }
  }

  return cents;
}

function parseNumberLoose(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return null;

  let s = v
    .replace(/\s+/g, " ")
    .replace(/[R$\u00A0]/g, "")
    .trim();

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
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
        evidence_detail: String(found.detail),
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

  // ====================== MELHORIA CRÍTICA ======================
  // Regex otimizado para pegar apenas o preço à vista (evita "12x de R$ 16,88")
  const moneyRegex =
    /R\$\s*(?:\d{1,3}(?:\.\d{3})*,)?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\s*(?:x|de|por|sem|juros))/gi;

  let match;
  let bestPrice: number | null = null;

  while ((match = moneyRegex.exec(html)) !== null) {
    const candidate = parseNumberLoose(match[1]);
    if (candidate && candidate > 0) {
      if (bestPrice === null || candidate > bestPrice) {
        bestPrice = candidate;
      }
    }
  }

  if (bestPrice !== null) {
    return {
      price: bestPrice,
      original: null,
      currency: "BRL",
      evidence: "regex_improved",
      evidence_detail: "improved_money_regex",
    };
  }

  return {
    price: null,
    original: null,
    currency: null,
    evidence: "none",
    evidence_detail: "none",
  };
}

async function validateCookie(cookie: string) {
  await jitter();
  const res = await fetch(COOKIE_TEST_URL, {
    method: "GET",
    headers: buildBrowserHeaders(cookie),
    redirect: "follow",
  });

  const html = await res.text();
  const title = shortTitle(html) ?? "n/a";
  const anyRes = res as any;
  const finalUrl =
    typeof anyRes.url === "string" && anyRes.url ? anyRes.url : COOKIE_TEST_URL;

  if (!res.ok) {
    throw new Error(`Cookie validation HTTP ${res.status} title=${title}`);
  }

  if (looksLikeLoginOrBot(html, finalUrl) && !html.includes("__NEXT_DATA__")) {
    throw new Error(
      "ML cookie invalid/expired (bot/login detected on test page)",
    );
  }
}

function errorMessage(e: unknown): string {
  if (!e) return "Unknown error";
  if (e instanceof Error) return e.message || "Error";
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
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

  // supabase disponível também no finally
  const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let jobRunId: number | null = null;
  let lastErrorSample: string | null = null;

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
    timedOut: 0,
  };

  let finalStatus: "success" | "partial" | "timeout" | "error" = "success";
  let stoppedEarly = false;

  const snapshotDate = utcDateString(new Date());

  const got = readCronSecret(req);
  if (!got || got !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  // offset/limit via querystring
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
      Number(u.searchParams.get("limit") || String(DEFAULT_LIMIT)) ||
        DEFAULT_LIMIT,
    ),
  );

  try {
    const { cookie, source } = readCookieFromEnvOrFile();
    log(
      `Cookie source=${source} offset=${offset} limit=${limit} maxMs=${MAX_RUN_MS}`,
    );

    await validateCookie(cookie);

    const { data: runRow, error: runErr } = await supabase
      .from("price_job_runs")
      .insert({
        platform: PLATFORM_LABEL,
        status: "running",
        started_at: new Date().toISOString(),
        stats: {
          snapshotDate,
          offset,
          batchSize: limit,
          concurrency: MAX_CONCURRENCY,
          scanned: job.scanned,
          updated: job.updated,
          failed: job.failed,
          cookieMissingOrExpired: job.cookieMissingOrExpired,
          priceNotFound: job.priceNotFound,
          http429: job.http429,
          retries: job.retries,
          durationMs: 0, // ✅ FIX: não existe ainda
          stoppedEarly,
          maxRunMs: MAX_RUN_MS,
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

    jobRunId = runRow.id;

    const { data: offers, error } = await supabase
      .from("store_offers")
      .select(
        "id, product_id, platform, external_id, url, is_active, current_price_cents",
      )
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`DB read store_offers error: ${error.message}`);

    const page = (offers ?? []) as StoreOffer[];
    const filtered = page.filter((o) => {
      const ok = isValidMLB(o.external_id);
      if (!ok) job.invalidExternalIdSkipped += 1;
      return ok;
    });

    log(`Page offers=${page.length} filtered=${filtered.length}`);

    let gateCount = 0;

    const { errors: poolErrors } = await runPool(
      filtered,
      MAX_CONCURRENCY,
      async (offer) => {
        job.scanned += 1;

        if (Date.now() > deadlineMs) {
          stoppedEarly = true;
          job.timedOut += 1;
          throw new Error("TIME_BUDGET_EXCEEDED");
        }

        const externalId = offer.external_id!;
        const parsed = parseMlExternalId(externalId);
        if (!parsed) return;

        const label = parsed.raw;

        const candidates: string[] = [];

        const urlRaw = offer.url?.trim() || null;
        if (urlRaw && !isSecUrl(urlRaw)) {
          candidates.push(urlRaw);
          const urlClean = cleanMlUrl(urlRaw);
          if (urlClean && urlClean !== urlRaw) candidates.push(urlClean);
        }

        candidates.push(...mlCandidateUrls(label));

        const seen = new Set<string>();
        const candidateUrls = candidates.filter((x) => {
          const k = (x || "").trim();
          if (!k) return false;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });

        let bestHtml: string | null = null;
        let bestFinalUrl: string | null = null;
        let bestFetchUrl: string | null = null;
        let bestFound: ReturnType<typeof extractPriceFromHtml> | null = null;

        for (const fetchUrl of candidateUrls) {
          if (Date.now() > deadlineMs) {
            stoppedEarly = true;
            job.timedOut += 1;
            throw new Error("TIME_BUDGET_EXCEEDED");
          }

          const pageRes = await fetchWithRetryHtml(
            fetchUrl,
            job,
            MAX_RETRIES,
            cookie,
            log,
            deadlineMs,
          );

          const anyRes = pageRes as any;
          const finalUrl =
            typeof anyRes.url === "string" && anyRes.url
              ? anyRes.url
              : fetchUrl;

          if (!pageRes.ok) {
            // marca um status útil (sem explodir o job)
            const nowIso = new Date().toISOString();
            await supabase
              .from("store_offers")
              .update({
                last_scrape_at: nowIso,
                last_scrape_status: `http_${pageRes.status}`,
                last_final_url: finalUrl,
                updated_at: nowIso,
              })
              .eq("id", offer.id);
            continue;
          }

          const html = await pageRes.text();
          const title = shortTitle(html);

          const extracted = extractPriceFromHtml(html);

          if (
            !hasStrongPrice(extracted) &&
            looksLikeLoginOrBot(html, finalUrl)
          ) {
            job.cookieMissingOrExpired += 1;
            gateCount += 1;

            const msg = `GATE ext=${label} title=${title ?? "n/a"} url=${finalUrl}`;
            if (!lastErrorSample) lastErrorSample = msg.slice(0, 500);
            log(msg);

            // marca status no offer
            const nowIso = new Date().toISOString();
            await supabase
              .from("store_offers")
              .update({
                last_scrape_at: nowIso,
                last_scrape_status: "gate",
                last_scrape_evidence: "bot_or_login",
                last_final_url: finalUrl,
                updated_at: nowIso,
                gate_count: (offer as any).gate_count
                  ? (offer as any).gate_count + 1
                  : 1,
              })
              .eq("id", offer.id);

            if (gateCount >= BOT_FAILFAST_THRESHOLD) {
              stoppedEarly = true;
              throw new Error("GATE_FAILFAST");
            }
            continue;
          }

          // evita falso-positivo
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
          const msg = `Price not found ext=${label} offerId=${offer.id}`;
          if (!lastErrorSample) lastErrorSample = msg.slice(0, 500);
          log(msg);

          const nowIso = new Date().toISOString();
          await supabase
            .from("store_offers")
            .update({
              last_scrape_at: nowIso,
              last_scrape_status: "price_not_found",
              updated_at: nowIso,
            })
            .eq("id", offer.id);

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
        };

        const { error: upErr } = await supabase.from("offer_last_price").upsert(
          {
            offer_id: label,
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
          throw new Error(
            `Upsert offer_last_price failed ext=${label}: ${upErr.message}`,
          );
        }

        const computedCents = Math.round(bestFound.price! * 100);
        const priceCents = sanitizeMlPriceCents({
          computedCents,
          prevCents: offer.current_price_cents ?? null,
        });

        const { error: soErr } = await supabase
          .from("store_offers")
          .update({
            current_price_cents: priceCents,
            current_currency: currency_id,
            current_price_updated_at: nowIso,

            last_scrape_at: nowIso,
            last_scrape_status: "ok",
            last_scrape_evidence: `${bestFound.evidence}:${bestFound.evidence_detail}`,
            last_final_url: bestFinalUrl,

            url: bestFinalUrl,
            updated_at: nowIso,
          })
          .eq("id", offer.id);

        if (soErr) {
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
          throw new Error(
            `Update products.mercadolivre_price failed ext=${label}: ${prodErr.message}`,
          );
        }

        job.updated += 1;

        log(
          `OK ext=${label} price=${bestFound.price} cents=${priceCents} final=${bestFinalUrl} currency=${currency_id}`,
        );
      },
    );

    if (poolErrors.length > 0) {
      const firstMsg = errorMessage(poolErrors[0]);
      if (!lastErrorSample) lastErrorSample = firstMsg.slice(0, 500);

      if (firstMsg.includes("TIME_BUDGET_EXCEEDED")) {
        finalStatus = "timeout";
      } else {
        finalStatus = "partial";
      }

      // conta failed só para erros "reais", não timeout/gate failfast
      for (const e of poolErrors) {
        const msg = errorMessage(e);
        if (msg.includes("TIME_BUDGET_EXCEEDED")) continue;
        if (msg.includes("GATE_FAILFAST")) continue;
        job.failed += 1;
      }
    }

    const durationMs = Date.now() - t0;

    const hadIncidents =
      job.failed > 0 ||
      job.cookieMissingOrExpired > 0 ||
      job.priceNotFound > 0 ||
      stoppedEarly ||
      finalStatus === "timeout";

    if (!hadIncidents) finalStatus = "success";
    else if (finalStatus !== "timeout") finalStatus = "partial";

    const nextOffset = offset + page.length;
    const done = page.length < limit;

    return res.status(200).json({
      ok: true,
      status: finalStatus,
      offset,
      limit,
      nextOffset,
      done,
      scanned: job.scanned,
      updated: job.updated,
      failed: job.failed,
      http429: job.http429,
      retries: job.retries,
      cookieMissingOrExpired: job.cookieMissingOrExpired,
      priceNotFound: job.priceNotFound,
      durationMs,
      stoppedEarly,
      errorSample: lastErrorSample,
      logs: logs.slice(-120),
    });
  } catch (e: any) {
    console.error(e);
    const msg = errorMessage(e);
    finalStatus = msg.includes("TIME_BUDGET_EXCEEDED") ? "timeout" : "error";
    if (!lastErrorSample) lastErrorSample = msg.slice(0, 500);

    return res.status(500).json({
      ok: false,
      status: finalStatus,
      error: msg,
    });
  } finally {
    try {
      if (jobRunId) {
        const durationMs = Date.now() - t0;

        await supabase
          .from("price_job_runs")
          .update({
            finished_at: new Date().toISOString(),
            status: finalStatus,
            stats: {
              snapshotDate,
              batchSize: limit,
              concurrency: MAX_CONCURRENCY,
              scanned: job.scanned,
              updated: job.updated,
              failed: job.failed,
              cookieMissingOrExpired: job.cookieMissingOrExpired,
              priceNotFound: job.priceNotFound,
              http429: job.http429,
              retries: job.retries,
              durationMs,
              stoppedEarly,
              maxRunMs: MAX_RUN_MS,
              offset,
            },
            error: lastErrorSample,
          })
          .eq("id", jobRunId);
      }
    } catch (err) {
      console.error("[ml-prices] finalize job_run failed", err);
    }
  }
}

// api/cron/ml-prices.ts - VERSÃO COMPLETA COM API OFICIAL (sem cookie)
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
  scanned: number;
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
const DEFAULT_LIMIT = Number(process.env.ML_PRICE_BATCH_SIZE || "10");
const MAX_CONCURRENCY = Number(process.env.ML_PRICE_CONCURRENCY || "1");
const MAX_RETRIES = Number(process.env.ML_PRICE_MAX_RETRIES || "1");
const BOT_FAILFAST_THRESHOLD = Number(
  process.env.ML_PRICE_BOT_FAILFAST_THRESHOLD || "3",
);

// budget de execução
const MAX_RUN_MS = Number(process.env.ML_PRICE_MAX_RUN_MS || "45000");

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
  await sleep(randInt(80, 220));
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

function sha1(s: string) {
  return crypto.createHash("sha1").update(s).digest("hex");
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

  if (cents >= 500_000 && cents % 100 === 0) {
    cents = Math.round(cents / 100);
  }

  if (prev && prev > 0 && cents > 0) {
    const ratio = cents / prev;
    if (ratio > 0.45 && ratio < 0.55) {
      return prev;
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

// ====================== FUNÇÃO PRINCIPAL - API OFICIAL ======================
async function getPriceFromML(mlb: string, accessToken: string) {
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
    // Pega token do banco (API oficial)
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

    // Refresh automático
    if (new Date(tokenRow.expires_at) < new Date() && tokenRow.refresh_token) {
      log("Token expirado → refresh automático");
      const refreshRes = await fetch(
        "https://api.mercadolibre.com/oauth/token",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: process.env.ML_CLIENT_ID!,
            client_secret: process.env.ML_CLIENT_SECRET!,
            refresh_token: tokenRow.refresh_token,
          }).toString(),
        },
      );

      const data = await refreshRes.json();
      if (!refreshRes.ok) throw new Error("Refresh falhou");

      accessToken = data.access_token;

      await supabase
        .from("ml_oauth_tokens")
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(
            Date.now() + data.expires_in * 1000,
          ).toISOString(),
        })
        .eq("id", tokenRow.id);

      log("Token renovado com sucesso");
    }

    log(`Token OK - offset=${offset} limit=${limit}`);

    const { data: offers, error } = await supabase
      .from("store_offers")
      .select(
        "id, product_id, platform, external_id, url, is_active, current_price_cents",
      )
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`DB read error: ${error.message}`);

    const page = (offers ?? []) as StoreOffer[];
    const filtered = page.filter((o) => isValidMLB(o.external_id));

    log(`Page offers=${page.length} filtered=${filtered.length}`);

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

        const mlb = offer.external_id!;
        const label = mlb;

        log(`Buscando preço para ${label}...`);

        const price = await getPriceFromML(label, accessToken);

        if (price === null) {
          job.priceNotFound += 1;
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

        const nowIso = new Date().toISOString();
        const verifiedDate = utcDateOnly(new Date());

        // Atualiza offer_last_price
        await supabase.from("offer_last_price").upsert(
          {
            offer_id: label,
            price: price,
            currency_id: "BRL",
            is_available: true,
            verified_at: nowIso,
            verified_date: verifiedDate,
            updated_at: nowIso,
            last_checked_at: nowIso,
          },
          { onConflict: "offer_id" },
        );

        // Atualiza store_offers
        const priceCents = Math.round(price * 100);
        await supabase
          .from("store_offers")
          .update({
            current_price_cents: priceCents,
            current_currency: "BRL",
            current_price_updated_at: nowIso,
            last_scrape_at: nowIso,
            last_scrape_status: "ok",
            updated_at: nowIso,
          })
          .eq("id", offer.id);

        // Atualiza products
        await supabase
          .from("products")
          .update({
            mercadolivre_price: price,
            updated_at: nowIso,
          })
          .eq("id", offer.product_id);

        job.updated += 1;

        log(`OK ${label} → R$ ${price}`);
      },
    );

    const durationMs = Date.now() - t0;

    return res.status(200).json({
      ok: true,
      updated: job.updated,
      total: page.length,
      durationMs,
      logs: logs.slice(-100),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

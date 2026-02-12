import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const COOKIE_ENC_KEY = process.env.ML_COOKIE_ENC_KEY!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

function readHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function utcDateString(d = new Date()) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function decryptCookie(encB64: string) {
  const key = Buffer.from(COOKIE_ENC_KEY, "base64");
  if (key.length !== 32) throw new Error("ML_COOKIE_ENC_KEY must decode to 32 bytes");
  const buf = Buffer.from(encB64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

function normalizeCookieHeader(cookie: string) {
  let s = (cookie || "").trim();
  s = s.replace(/^cookie\s*:\s*/i, "");
  s = s.replace(/[\r\n]+/g, " ").trim();
  s = s.replace(/\s{2,}/g, " ");
  return s;
}

async function getGlobalCookie(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase
    .from("affiliate_ml_settings")
    .select("cookie_encrypted, updated_at")
    .eq("id", "singleton")
    .maybeSingle<{ cookie_encrypted: string; updated_at: string }>();

  if (error || !data?.cookie_encrypted) return null;
  try {
    return normalizeCookieHeader(decryptCookie(data.cookie_encrypted));
  } catch {
    return null;
  }
}

function buildBrowserHeaders(cookie: string | null) {
  const headers: Record<string, string> = {
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "upgrade-insecure-requests": "1",
    referer: "https://www.mercadolivre.com.br/",
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  if (cookie) headers.cookie = cookie;
  return headers;
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
  const cleaned = v
    .replace(/\s+/g, " ")
    .replace(/[R$\u00A0]/g, "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function extractMetaPrice(html: string) {
  const priceM = html.match(/<meta[^>]+itemprop=["']price["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const curM = html.match(/<meta[^>]+itemprop=["']priceCurrency["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  const price = priceM?.[1] ? parseNumberLoose(priceM[1]) : null;
  const currency = curM?.[1] ?? null;
  return { price, currency };
}

function looksLikeLoginOrBot(html: string, finalUrl: string) {
  const s = html.toLowerCase();
  const botSignals =
    s.includes("hcaptcha") ||
    s.includes("g-recaptcha") ||
    s.includes("recaptcha") ||
    s.includes("captcha") ||
    s.includes("challenge") ||
    (s.includes("verifique") && s.includes("robô")) ||
    s.includes("não sou um robô");

  const loginSignals =
    s.includes("iniciar sessão") ||
    s.includes("inicie sessão") ||
    s.includes("entrar na sua conta") ||
    (s.includes("identificação") && s.includes("e-mail"));

  const urlSignals = /\/(authorization|auth|login)\b/i.test(finalUrl) || /\/(ingreso|entrar)\b/i.test(finalUrl);
  return botSignals || loginSignals || urlSignals;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const got = readHeader(req, "x-cron-secret");
    if (got !== CRON_SECRET) return res.status(401).json({ ok: false, error: "Unauthorized" });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const cookie = await getGlobalCookie(supabase);
    if (!cookie) {
      return res.status(200).json({
        ok: true,
        status: "cookie_missing",
        cookieOk: false,
      });
    }

    const { data: offer, error: offErr } = await supabase
      .from("store_offers")
      .select("id, external_id, url")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true)
      .not("external_id", "is", null)
      .limit(1)
      .maybeSingle<{ id: number; external_id: string | null; url: string | null }>();

    if (offErr) throw new Error(offErr.message);
    if (!offer?.id) {
      return res.status(200).json({
        ok: true,
        status: "no_active_offer",
        cookieOk: true,
      });
    }

    const targetUrl =
      offer.url?.trim() ||
      (offer.external_id ? `https://www.mercadolivre.com.br/p/${offer.external_id}` : null);

    if (!targetUrl) {
      return res.status(200).json({
        ok: true,
        status: "offer_missing_url",
        cookieOk: true,
        offerId: offer.id,
      });
    }

    const r = await fetch(targetUrl, { method: "GET", redirect: "follow", headers: buildBrowserHeaders(cookie) });
    const anyR = r as any;
    const finalUrl = typeof anyR.url === "string" ? anyR.url : targetUrl;
    const html = await r.text();

    if (!r.ok) {
      return res.status(200).json({
        ok: true,
        status: "http_error",
        cookieOk: true,
        offerId: offer.id,
        httpStatus: r.status,
        finalUrl,
      });
    }

    if (looksLikeLoginOrBot(html, finalUrl)) {
      return res.status(200).json({
        ok: true,
        status: "bot_or_login",
        cookieOk: true,
        offerId: offer.id,
        finalUrl,
      });
    }

    const meta = extractMetaPrice(html);
    if (meta.price === null) {
      return res.status(200).json({
        ok: true,
        status: "price_not_found",
        cookieOk: true,
        offerId: offer.id,
        finalUrl,
        hint: "No meta price found; full cron likely still works due to deeper parsers.",
        dateUtc: utcDateString(),
      });
    }

    return res.status(200).json({
      ok: true,
      status: "healthy",
      cookieOk: true,
      offerId: offer.id,
      finalUrl,
      price: meta.price,
      currency: meta.currency ?? "BRL",
      dateUtc: utcDateString(),
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_SECRET = process.env.ADMIN_SECRET!;
const COOKIE_ENC_KEY = process.env.ML_COOKIE_ENC_KEY!; // base64 → 32 bytes

/* =========================
   Helpers
========================= */

function readHeader(req: VercelRequest, name: string) {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function normalizeCookie(input: string) {
  let s = (input || "").trim();

  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }

  s = s.replace(/^cookie\s*:\s*/i, "");
  s = s.replace(/[\r\n]+/g, " ").trim();
  s = s.replace(/\s{2,}/g, " ");

  return s;
}

function encryptCookie(plain: string) {
  const key = Buffer.from(COOKIE_ENC_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("ML_COOKIE_ENC_KEY must decode to 32 bytes");
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, enc]).toString("base64");
}

async function readRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return "";
}

/* =========================
   Cookie Validation
========================= */

async function validateCookie(cookie: string) {
  const res = await fetch("https://www.mercadolivre.com.br/", {
    method: "GET",
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "pt-BR,pt;q=0.9",
      cookie,
    },
  });

  const html = (await res.text()).toLowerCase();

  if (
    html.includes("captcha") ||
    html.includes("não sou um robô") ||
    html.includes("verifique") ||
    html.includes("datadome") ||
    html.includes("access denied") ||
    html.includes("iniciar sessão") ||
    html.includes("entrar na sua conta")
  ) {
    throw new Error("Cookie inválido ou bloqueado pelo Mercado Livre");
  }
}

/* =========================
   Handler
========================= */

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ ok: false, error: "Method not allowed" });
    }

    const got = readHeader(req, "x-admin-secret");
    if (got !== ADMIN_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const contentType = (readHeader(req, "content-type") || "").toLowerCase();
    const raw = (await readRawBody(req)).trim();

    let cookie = "";
    let tag: string | null = null;

    if (contentType.includes("text/plain")) {
      cookie = normalizeCookie(raw);
    } else {
      try {
        const body = raw ? JSON.parse(raw) : {};
        cookie = normalizeCookie(String(body?.cookie ?? ""));
        tag = body?.tag ? String(body.tag).trim() : null;
      } catch {
        return res.status(400).json({
          ok: false,
          error: "Invalid JSON. Send cookie as text/plain or { cookie }",
        });
      }
    }

    if (!cookie || cookie.length < 40) {
      return res.status(400).json({ ok: false, error: "cookie is required" });
    }

    // ✅ valida cookie antes de salvar
    await validateCookie(cookie);

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );

    const cookie_encrypted = encryptCookie(cookie);

    const { error } = await supabase
      .from("affiliate_ml_settings")
      .upsert(
        {
          id: "singleton",
          cookie_encrypted,
          tag,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: e?.message || "Unknown error",
    });
  }
}

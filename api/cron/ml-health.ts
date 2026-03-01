// api/cron/ml-health.ts - Health check do token OAuth do Mercado Livre
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

function readHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function readCronSecret(req: VercelRequest): string {
  const h = readHeader(req, "x-cron-secret");
  if (h) return h;

  const auth = readHeader(req, "authorization");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const got = readCronSecret(req);
    if (!got || got !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Busca o token mais recente
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("ml_oauth_tokens")
      .select("id, access_token, refresh_token, expires_at, updated_at")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenErr) {
      return res.status(500).json({ ok: false, error: tokenErr.message });
    }

    if (!tokenRow) {
      return res.status(200).json({
        ok: true,
        status: "token_missing",
        tokenOk: false,
        hint: "Nenhum token encontrado. Rode /api/ml/oauth/start para autenticar.",
      });
    }

    const expiresAt = new Date(tokenRow.expires_at);
    const now = new Date();
    const isExpired = expiresAt < now;
    const minutesUntilExpiry = Math.round((expiresAt.getTime() - now.getTime()) / 60000);

    if (isExpired && !tokenRow.refresh_token) {
      return res.status(200).json({
        ok: true,
        status: "token_expired_no_refresh",
        tokenOk: false,
        expiresAt: tokenRow.expires_at,
        hint: "Token expirado e sem refresh_token. Rode /api/ml/oauth/start para reautenticar.",
      });
    }

    // Testa o token fazendo uma chamada real à API do ML
    const testRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${tokenRow.access_token}` },
    });

    if (!testRes.ok) {
      const body = await testRes.json().catch(() => ({}));
      return res.status(200).json({
        ok: true,
        status: isExpired ? "token_expired" : "token_invalid",
        tokenOk: false,
        httpStatus: testRes.status,
        expiresAt: tokenRow.expires_at,
        isExpired,
        minutesUntilExpiry,
        hasRefreshToken: !!tokenRow.refresh_token,
        apiError: (body as any)?.message ?? null,
        hint: isExpired
          ? "Token expirado. O ml-prices vai fazer refresh automático na próxima execução."
          : "Token rejeitado pela API. Rode /api/ml/oauth/start para reautenticar.",
      });
    }

    const user = await testRes.json().catch(() => ({}));

    return res.status(200).json({
      ok: true,
      status: "healthy",
      tokenOk: true,
      expiresAt: tokenRow.expires_at,
      isExpired,
      minutesUntilExpiry,
      hasRefreshToken: !!tokenRow.refresh_token,
      mlUserId: (user as any)?.id ?? null,
      mlNickname: (user as any)?.nickname ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}

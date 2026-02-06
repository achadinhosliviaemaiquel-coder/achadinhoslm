import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClientIp(req: VercelRequest) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.length > 0) return xf.split(",")[0].trim();
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const product_id =
    String((req.query.product_id as string) || "") ||
    String((req.body?.product_id as string) || "");

  const session_id =
    String((req.query.session_id as string) || "") ||
    String((req.body?.session_id as string) || "");

  res.setHeader("Cache-Control", "no-store");

  if (!product_id) return res.status(400).send("Missing product_id");

  const supabase = getServerSupabase();
  if (!supabase) {
    // Em dev isso tem que ser óbvio
    console.error(
      "[/api/view] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
    // 500 em dev ajuda a enxergar, mas se você prefere manter 204, tudo bem.
    return res.status(500).send("Server misconfigured");
  }

  try {
    // Dedupe: mesma sessão + produto nas últimas 24h (ajuste se quiser)
    const DEDUPE_MINUTES = 24 * 60;

    if (session_id) {
      const since = new Date(
        Date.now() - DEDUPE_MINUTES * 60 * 1000,
      ).toISOString();

      const { data, error } = await supabase
        .from("product_views")
        .select("id")
        .eq("product_id", product_id)
        .eq("session_id", session_id)
        .gte("created_at", since)
        .limit(1);

      if (!error && data && data.length > 0) {
        return res.status(204).end();
      }
    }

    const userAgent = req.headers["user-agent"] ?? null;
    const referer = req.headers["referer"] ?? null;
    const { error } = await supabase.from("product_views").insert({
      product_id,
      session_id: session_id || null,
      user_agent: userAgent,
      referer,
    });

    if (error) console.error("[/api/view] Supabase insert error:", error);
  } catch (e) {
    console.error("[/api/view] Error:", e);
  }

  return res.status(204).end();
}

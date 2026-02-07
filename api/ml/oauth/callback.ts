// api/ml/oauth/callback.ts
import { createClient } from "@supabase/supabase-js";

export default async function handler(req: any, res: any) {
  try {
    const code = typeof req.query?.code === "string" ? req.query.code : "";
    if (!code) {
      res.statusCode = 400;
      return res.end("Missing code");
    }

    const clientId = process.env.ML_CLIENT_ID || "";
    const clientSecret = process.env.ML_CLIENT_SECRET || "";
    const redirectUri = process.env.ML_REDIRECT_URI || "";
    const supabaseUrl = process.env.SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

    if (
      !clientId ||
      !clientSecret ||
      !redirectUri ||
      !supabaseUrl ||
      !serviceKey
    ) {
      res.statusCode = 500;
      return res.end("Missing env vars");
    }

    const tokenRes = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      }).toString(),
    });

    const raw = (await tokenRes.json().catch(() => ({}))) as any;

    if (!tokenRes.ok) {
      res.statusCode = 500;
      return res.end(
        `Token exchange failed: ${JSON.stringify(raw).slice(0, 1200)}`,
      );
    }

    const access_token = raw.access_token as string | undefined;
    const refresh_token = (raw.refresh_token as string | undefined) ?? null; // <- pode ser null
    const token_type = (raw.token_type as string) || "Bearer";
    const expires_in = Number(raw.expires_in || 0);
    const scope = raw.scope as string | undefined;
    const user_id = raw.user_id as number | undefined;

    // ✅ agora só exige access_token e expires_in
    if (!access_token || !expires_in) {
      res.statusCode = 500;
      return res.end(
        `Invalid token payload: ${JSON.stringify(raw).slice(0, 1200)}`,
      );
    }

    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    await supabase
      .from("ml_oauth_tokens")
      .delete()
      .lt(
        "updated_at",
        new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      );

    const { error } = await supabase.from("ml_oauth_tokens").insert({
      access_token,
      refresh_token, // pode ser null
      token_type,
      expires_at,
      scope,
      user_id,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      res.statusCode = 500;
      return res.end(`DB save failed: ${error.message}`);
    }

    res.statusCode = 200;
    res.setHeader("content-type", "text/plain; charset=utf-8");
    return res.end(
      `OK. Token salvo no Supabase.\nexpires_at=${expires_at}\nrefresh_token=${refresh_token ? "yes" : "no"}\nAgora rode o ml-prices.`,
    );
  } catch (e: any) {
    res.statusCode = 500;
    return res.end(`Callback crash: ${e?.message || String(e)}`);
  }
}

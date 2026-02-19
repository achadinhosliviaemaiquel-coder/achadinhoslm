// api/cron/ml-prices.ts - VERSÃO FINAL (API Oficial + chama função do banco)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const MAX_RUN_MS = Number(process.env.ML_PRICE_MAX_RUN_MS || "45000");

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-prices-api] ${new Date().toISOString()} ${s}`;
    logs.push(line);
    console.log(line);
  };

  try {
    const secret =
      (req.headers["x-cron-secret"] as string) ||
      (req.query.cron_secret as string);
    if (secret !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1. Pega token mais recente
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (tokenErr || !tokenRow) {
      throw new Error("Nenhum token encontrado. Rode o callback primeiro.");
    }

    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.expires_at);

    // 2. Refresh automático se expirado
    if (Date.now() > expiresAt.getTime() && tokenRow.refresh_token) {
      log("🔄 Token expirado → refresh automático");
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

      const refreshData = await refreshRes.json();

      if (!refreshRes.ok) throw new Error(`Refresh falhou`);

      accessToken = refreshData.access_token;

      await supabase
        .from("ml_oauth_tokens")
        .update({
          access_token: refreshData.access_token,
          refresh_token: refreshData.refresh_token,
          expires_at: new Date(
            Date.now() + refreshData.expires_in * 1000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", tokenRow.id);

      log("✅ Token renovado");
    }

    // 3. Busca ofertas ativas
    const { data: offers, error: offersErr } = await supabase
      .from("store_offers")
      .select("id, external_id, product_id")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true);

    if (offersErr) throw offersErr;

    log(`📦 Encontradas ${offers?.length || 0} ofertas`);

    const updates: any[] = [];

    for (let i = 0; i < offers.length; i += 50) {
      const batch = offers.slice(i, i + 50);
      const ids = batch.map((o) => o.external_id).join(",");

      const apiRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${ids}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const items = await apiRes.json();

      for (const item of Array.isArray(items) ? items : [items]) {
        if (!item || item.error || !item.price) continue;

        const offer = batch.find((o) => o.external_id === item.id);
        if (!offer) continue;

        updates.push({
          offer_id: item.id,
          price: item.price,
          verified_at: new Date().toISOString(),
        });
      }
    }

    // 4. Chama a função do seu banco (apply_offer_price_updates)
    if (updates.length > 0) {
      const { data, error } = await supabase.rpc("apply_offer_price_updates", {
        p_updates: updates,
      });

      if (error) throw error;

      log(
        `✅ apply_offer_price_updates executada com ${updates.length} preços`,
      );
    }

    const durationMs = Date.now() - t0;

    return res.status(200).json({
      ok: true,
      updated: updates.length,
      total: offers.length,
      durationMs,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

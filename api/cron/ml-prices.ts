// api/cron/ml-prices.ts - VERSÃO FINAL COM API OFICIAL (batch pequeno)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const BATCH_SIZE = 5; // Reduzido para evitar bad_request

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-prices] ${new Date().toISOString()} ${s}`;
    logs.push(line);
    console.log(line);
  };

  try {
    const secret = (req.headers["x-cron-secret"] as string) || (req.query.cron_secret as string);
    if (secret !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    log("=== ml-prices API Oficial INICIADO ===");

    // Pega token
    const { data: tokenRow } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow) throw new Error("Nenhum token encontrado. Rode o callback primeiro.");

    let accessToken = tokenRow.access_token;

    // Refresh automático
    if (new Date(tokenRow.expires_at) < new Date() && tokenRow.refresh_token) {
      log("Token expirado → fazendo refresh...");
      const refreshRes = await fetch("https://api.mercadolibre.com/oauth/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: process.env.ML_CLIENT_ID!,
          client_secret: process.env.ML_CLIENT_SECRET!,
          refresh_token: tokenRow.refresh_token,
        }).toString(),
      });

      const data = await refreshRes.json();
      if (!refreshRes.ok) throw new Error("Refresh falhou");

      accessToken = data.access_token;

      await supabase
        .from("ml_oauth_tokens")
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        })
        .eq("id", tokenRow.id);

      log("Token renovado com sucesso");
    }

    // Busca ofertas
    const { data: offers } = await supabase
      .from("store_offers")
      .select("id, external_id, product_id")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true);

    log(`Encontradas ${offers?.length || 0} ofertas ativas`);

    let updated = 0;

    for (let i = 0; i < (offers?.length || 0); i += BATCH_SIZE) {
      const batch = (offers || []).slice(i, i + BATCH_SIZE);
      const validBatch = batch.filter(o => o.external_id && (o.external_id.startsWith("MLB") || o.external_id.startsWith("MLBU")));

      if (validBatch.length === 0) continue;

      const ids = validBatch.map(o => o.external_id).join(",");

      log(`Buscando batch de ${validBatch.length} itens: ${ids}`);

      const apiRes = await fetch(`https://api.mercadolibre.com/items?ids=${ids}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!apiRes.ok) {
        log(`API erro ${apiRes.status}`);
        continue;
      }

      const items = await apiRes.json();

      for (const item of Array.isArray(items) ? items : [items]) {
        if (!item || item.error || !item.price || item.price <= 0) continue;

        const offer = validBatch.find(o => o.external_id === item.id);
        if (!offer) continue;

        const updates = [{
          offer_id: item.id,
          price: item.price,
          verified_at: new Date().toISOString(),
        }];

        const { error } = await supabase.rpc("apply_offer_price_updates", {
          p_updates: updates,
        });

        if (!error) {
          updated++;
          log(`✅ ATUALIZADO: ${item.id} → R$ ${item.price}`);
        }
      }
    }

    log(`FINALIZADO! ${updated} preços atualizados`);

    return res.status(200).json({
      ok: true,
      updated,
      total: offers?.length || 0,
    });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
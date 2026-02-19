// api/cron/ml-prices.ts - VERSÃO FINAL USANDO API OFICIAL (sem cookie)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const MAX_RUN_MS = Number(process.env.ML_PRICE_MAX_RUN_MS || "45000");

type StoreOffer = {
  id: number;
  product_id: string;
  platform: string;
  external_id: string | null;
  url: string | null;
  is_active: boolean;
  current_price_cents?: number | null;
};

type TokenRow = {
  id: number;
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
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

    // 1. Pega o token mais recente
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single<TokenRow>();

    if (tokenErr || !tokenRow) {
      throw new Error("Nenhum token encontrado. Rode /api/ml/oauth/start e autorize o app.");
    }

    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.expires_at);

    // 2. Refresh automático se expirado
    if (Date.now() > expiresAt.getTime() && tokenRow.refresh_token) {
      log("🔄 Token expirado → fazendo refresh...");
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
      if (!refreshRes.ok) throw new Error(`Refresh falhou: ${JSON.stringify(data)}`);

      accessToken = data.access_token;

      await supabase
        .from("ml_oauth_tokens")
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", tokenRow.id);

      log("✅ Token renovado com sucesso");
    }

    // 3. Busca ofertas ativas
    const { data: offers, error: offersErr } = await supabase
      .from("store_offers")
      .select("id, external_id, product_id, current_price_cents")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true);

    if (offersErr) throw offersErr;

    log(`Encontradas ${offers?.length || 0} ofertas ativas`);

    let updated = 0;

    // Processa item por item para evitar limites da API
    for (const offer of offers || []) {
      const mlb = offer.external_id?.trim();
      if (!mlb || (!mlb.startsWith("MLB") && !mlb.startsWith("MLBU"))) continue;

      log(`Buscando preço para ${mlb}...`);

      const apiRes = await fetch(`https://api.mercadolibre.com/items/${mlb}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!apiRes.ok) {
        log(`API erro ${apiRes.status} para ${mlb}`);
        continue;
      }

      const item = await apiRes.json();

      if (item.error || !item.price || item.price <= 0) {
        log(`Sem preço válido para ${mlb}`);
        continue;
      }

      // Chama a função do seu banco
      const { error: rpcError } = await supabase.rpc("apply_offer_price_updates", {
        p_updates: [{
          offer_id: mlb,
          price: item.price,
          verified_at: new Date().toISOString(),
        }],
      });

      if (rpcError) {
        log(`Erro na função apply_offer_price_updates: ${rpcError.message}`);
      } else {
        updated++;
        log(`✅ ATUALIZADO: ${mlb} → R$ ${item.price}`);
      }
    }

    const durationMs = Date.now() - t0;

    log(`FINALIZADO! ${updated} preços atualizados em ${durationMs}ms`);

    return res.status(200).json({
      ok: true,
      updated,
      total: offers?.length || 0,
      durationMs,
    });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}
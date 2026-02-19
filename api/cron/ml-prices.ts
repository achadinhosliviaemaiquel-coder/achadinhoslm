// api/cron/ml-prices.ts - VERSÃO ULTRA TOLERANTE (ignora 404 e continua)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-prices] ${new Date().toISOString()} ${s}`;
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

    log("=== INICIANDO ml-prices (versão ultra tolerante) ===");

    // Pega token
    const { data: tokenRow } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow) throw new Error("Nenhum token encontrado");

    const accessToken = tokenRow.access_token;

    // Busca ofertas
    const { data: offers } = await supabase
      .from("store_offers")
      .select("id, external_id, product_id")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true);

    log(`Encontradas ${offers?.length || 0} ofertas ativas`);

    let updated = 0;

    for (const offer of offers || []) {
      const mlb = offer.external_id?.trim();

      if (!mlb || (!mlb.startsWith("MLB") && !mlb.startsWith("MLBU"))) {
        log(`Ignorado - MLB inválido: ${mlb || "null"}`);
        continue;
      }

      log(`Buscando preço para ${mlb}...`);

      const apiRes = await fetch(`https://api.mercadolibre.com/items/${mlb}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!apiRes.ok) {
        log(`API erro ${apiRes.status} para ${mlb} (ignorado)`);
        continue;
      }

      const item = await apiRes.json();

      if (item.error || !item.price || item.price <= 0) {
        log(`Sem preço válido para ${mlb} (price = ${item.price})`);
        continue;
      }

      const updates = [
        {
          offer_id: mlb,
          price: item.price,
          verified_at: new Date().toISOString(),
        },
      ];

      const { error: rpcError } = await supabase.rpc(
        "apply_offer_price_updates",
        {
          p_updates: updates,
        },
      );

      if (rpcError) {
        log(`Erro na função: ${rpcError.message}`);
      } else {
        updated++;
        log(`✅ SUCESSO: ${mlb} → R$ ${item.price}`);
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

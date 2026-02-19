// api/cron/ml-prices.ts - VERSÃO DIAGNÓSTICO (muitos logs para entender o que está acontecendo)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-prices-debug] ${new Date().toISOString()} ${s}`;
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

    log("=== INICIANDO ml-prices DEBUG ===");

    // 1. Token
    const { data: tokenRow } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow)
      throw new Error("Nenhum token encontrado na tabela ml_oauth_tokens");

    let accessToken = tokenRow.access_token;
    log(`Token encontrado. Expira em: ${tokenRow.expires_at}`);

    // 2. Busca ofertas
    const { data: offers } = await supabase
      .from("store_offers")
      .select("id, external_id, product_id")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true);

    log(`Encontradas ${offers?.length || 0} ofertas ativas`);

    const updates: any[] = [];

    for (let i = 0; i < (offers?.length || 0); i += 50) {
      const batch = offers!.slice(i, i + 50);
      const ids = batch.map((o) => o.external_id).join(",");

      log(`Buscando batch de ${batch.length} itens: ${ids}`);

      const apiRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${ids}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      const items = await apiRes.json();
      log(`API retornou ${Array.isArray(items) ? items.length : 1} itens`);

      for (const item of Array.isArray(items) ? items : [items]) {
        if (!item || item.error) {
          log(
            `Item com erro: ${item?.id || "unknown"} - ${item?.error || "sem dados"}`,
          );
          continue;
        }

        if (!item.price) {
          log(`Item ${item.id} sem preço`);
          continue;
        }

        const offer = batch.find((o) => o.external_id === item.id);
        if (!offer) {
          log(`Offer não encontrado para item ${item.id}`);
          continue;
        }

        updates.push({
          offer_id: item.id,
          price: item.price,
          verified_at: new Date().toISOString(),
        });

        log(`✅ Adicionado update: offer_id=${item.id} price=R$${item.price}`);
      }
    }

    log(`Total de updates preparados: ${updates.length}`);

    if (updates.length > 0) {
      log("Chamando função apply_offer_price_updates...");
      const { data, error } = await supabase.rpc("apply_offer_price_updates", {
        p_updates: updates,
      });

      if (error) {
        log(`ERRO na função apply_offer_price_updates: ${error.message}`);
        throw error;
      }

      log(
        `Função apply_offer_price_updates executada com sucesso. Retorno: ${JSON.stringify(data)}`,
      );
    } else {
      log("NENHUM update preparado - nenhum preço encontrado na API");
    }

    return res.status(200).json({
      ok: true,
      updated: updates.length,
      total: offers?.length || 0,
      logs: logs.slice(-80),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

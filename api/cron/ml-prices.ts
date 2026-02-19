// api/cron/ml-prices.ts - VERSÃO CORRIGIDA E OTIMIZADA
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const MAX_RUN_MS = Number(process.env.ML_PRICE_MAX_RUN_MS || "45000");
const BATCH_SIZE = 10; // Reduzido para evitar bad_request

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
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

    log("=== INICIANDO ml-prices ===");

    // Pega token
    const { data: tokenRow } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow) throw new Error("Nenhum token encontrado");

    let accessToken = tokenRow.access_token;
    log(`Token OK (expira em ${tokenRow.expires_at})`);

    // Busca ofertas
    const { data: offers } = await supabase
      .from("store_offers")
      .select("id, external_id, product_id")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true);

    log(`Encontradas ${offers?.length || 0} ofertas ativas`);

    let updated = 0;
    const updates: any[] = [];

    // Processa em batches pequenos
    for (let i = 0; i < (offers?.length || 0); i += BATCH_SIZE) {
      const batch = offers!.slice(i, i + BATCH_SIZE);

      // Filtra apenas MLB válidos
      const validBatch = batch.filter(
        (o) => o.external_id && o.external_id.startsWith("MLB"),
      );
      if (validBatch.length === 0) continue;

      const ids = validBatch.map((o) => o.external_id).join(",");

      log(`Buscando ${validBatch.length} itens: ${ids}`);

      const apiRes = await fetch(
        `https://api.mercadolibre.com/items?ids=${ids}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!apiRes.ok) {
        log(`API erro ${apiRes.status}`);
        continue;
      }

      const items = await apiRes.json();

      for (const item of Array.isArray(items) ? items : [items]) {
        if (!item || item.error || !item.price) {
          log(`Item sem preço ou erro: ${item?.id || "unknown"}`);
          continue;
        }

        const offer = validBatch.find((o) => o.external_id === item.id);
        if (!offer) continue;

        updates.push({
          offer_id: item.id,
          price: item.price,
          verified_at: new Date().toISOString(),
        });

        updated++;
        log(`✅ Adicionado update: ${item.id} → R$ ${item.price}`);
      }
    }

    // Chama função do banco
    if (updates.length > 0) {
      log(`Chamando apply_offer_price_updates com ${updates.length} preços...`);
      const { error } = await supabase.rpc("apply_offer_price_updates", {
        p_updates: updates,
      });

      if (error) {
        log(`ERRO na função: ${error.message}`);
        throw error;
      }
      log("✅ apply_offer_price_updates executada com sucesso");
    } else {
      log("NENHUM preço encontrado na API");
    }

    const durationMs = Date.now() - t0;

    return res.status(200).json({
      ok: true,
      updated,
      total: offers?.length || 0,
      durationMs,
      logs: logs.slice(-50),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

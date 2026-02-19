// api/cron/ml-resolve-sec.ts - VERSÃO ATUALIZADA (sem cookie + mais estável)
import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const MAX_CONCURRENCY = Number(process.env.ML_RESOLVE_CONCURRENCY || "3");
const MAX_ITEMS = Number(process.env.ML_RESOLVE_MAX_ITEMS || "300");

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function randInt(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function jitter() {
  await sleep(randInt(80, 250));
}

function readHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function readCronSecret(req: VercelRequest): string {
  const h = readHeader(req, "x-cron-secret");
  if (h) return h;

  try {
    const host = readHeader(req, "x-forwarded-host") || readHeader(req, "host");
    const proto = readHeader(req, "x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
    const url = new URL(req.url || "/", `${proto}://${host || "localhost"}`);
    return url.searchParams.get("cron_secret") || "";
  } catch {
    return "";
  }
}

/**
 * Extrai MLB / MLBU de qualquer URL ou string
 */
function extractMlExternalId(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input);

  const mlbu = s.match(/(MLBU\d{6,14})/i)?.[1];
  if (mlbu) return mlbu.toUpperCase();

  const mlb = s.match(/(MLB\d{6,14})/i)?.[1];
  if (mlb) return mlb.toUpperCase();

  const mlbDash = s.match(/MLB-(\d{6,14})/i)?.[1];
  if (mlbDash) return `MLB${mlbDash}`;

  return null;
}

async function resolveFinalUrl(url: string): Promise<string> {
  await jitter();

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });

    const finalUrl = res.url || url;
    return finalUrl;
  } catch (e) {
    console.error(`Resolve URL failed: ${url}`, e);
    return url;
  }
}

type ProductRow = {
  id: string;
  mercadolivre_link: string | null;
  source_url: string | null;
  is_active: boolean;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-resolve-sec] ${new Date().toISOString()} ${s}`;
    logs.push(line);
    console.log(line);
  };

  try {
    const got = readCronSecret(req);
    if (!got || got !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Busca produtos com link do Mercado Livre
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, mercadolivre_link, source_url, is_active")
      .eq("is_active", true)
      .not("mercadolivre_link", "is", null)
      .limit(MAX_ITEMS);

    if (pErr) throw new Error(`DB read error: ${pErr.message}`);

    const targets = (products as ProductRow[]).filter((p) => {
      const url = (p.mercadolivre_link || "").trim();
      return url && (url.includes("/sec/") || url.includes("social/"));
    });

    log(`products scanned=${products?.length ?? 0} | targets=${targets.length}`);

    let scanned = 0;
    let resolved = 0;
    let updatedProducts = 0;
    let upsertedOffers = 0;
    let failed = 0;

    for (const p of targets) {
      scanned++;

      const original = (p.mercadolivre_link || "").trim();
      const sourceUrl = (p.source_url || "").trim() || null;

      let finalUrl: string | null = null;

      try {
        finalUrl = await resolveFinalUrl(original);

        if (finalUrl.includes("/social/") || finalUrl.includes("forceInApp=true")) {
          log(`BAD finalUrl product=${p.id} finalUrl=${finalUrl}`);
          continue;
        }
      } catch (e) {
        failed++;
        log(`Resolve failed product=${p.id} url=${original}`);
        continue;
      }

      const mlb = extractMlExternalId(finalUrl) || extractMlExternalId(sourceUrl);

      if (!mlb) {
        failed++;
        log(`MLB not found product=${p.id} finalUrl=${finalUrl} source=${sourceUrl}`);
        continue;
      }

      resolved++;

      // Atualiza link limpo na tabela products
      if (finalUrl && finalUrl !== original) {
        await supabase
          .from("products")
          .update({ mercadolivre_link: finalUrl })
          .eq("id", p.id);

        updatedProducts++;
      }

      // Atualiza/cria na store_offers
      await supabase.from("store_offers").upsert(
        {
          product_id: p.id,
          platform: PLATFORM_LABEL,
          external_id: mlb,
          url: finalUrl || original,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,platform" }
      );

      upsertedOffers++;

      log(`OK product=${p.id} mlb=${mlb} url=${finalUrl || original}`);
    }

    return res.status(200).json({
      ok: true,
      scanned,
      targets: targets.length,
      resolved,
      updatedProducts,
      upsertedOffers,
      failed,
    });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
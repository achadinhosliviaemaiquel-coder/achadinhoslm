// api/cron/ml-resolve-sec.ts - VERSÃO SIMPLES E ESTÁVEL (sem cookie)
import "dotenv/config";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const MAX_ITEMS = Number(process.env.ML_RESOLVE_MAX_ITEMS || "300");

function readCronSecret(req: VercelRequest): string {
  const h = req.headers["x-cron-secret"] as string | undefined;
  if (h) return h;

  try {
    const url = new URL(req.url || "/", `https://${req.headers.host}`);
    return url.searchParams.get("cron_secret") || "";
  } catch {
    return "";
  }
}

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
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return res.url || url;
  } catch {
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

    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, mercadolivre_link, source_url, is_active")
      .eq("is_active", true)
      .not("mercadolivre_link", "is", null)
      .limit(MAX_ITEMS);

    if (pErr) throw pErr;

    const targets = (products as ProductRow[]).filter((p) => {
      const url = (p.mercadolivre_link || "").trim();
      return url && (url.includes("/sec/") || url.includes("/social/"));
    });

    log(`scanned=${products?.length ?? 0} targets=${targets.length}`);

    let scanned = 0;
    let resolved = 0;
    let updated = 0;

    for (const p of targets) {
      scanned++;

      const original = (p.mercadolivre_link || "").trim();
      let finalUrl = await resolveFinalUrl(original);

      if (finalUrl.includes("/social/") || finalUrl.includes("forceInApp=true")) {
        log(`BAD finalUrl product=${p.id} url=${finalUrl}`);
        continue;
      }

      const mlb = extractMlExternalId(finalUrl) || extractMlExternalId(p.source_url);

      if (!mlb) {
        log(`MLB not found product=${p.id}`);
        continue;
      }

      resolved++;

      if (finalUrl !== original) {
        await supabase
          .from("products")
          .update({ mercadolivre_link: finalUrl })
          .eq("id", p.id);
        updated++;
      }

      await supabase.from("store_offers").upsert({
        product_id: p.id,
        platform: PLATFORM_LABEL,
        external_id: mlb,
        url: finalUrl,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "product_id,platform" });

      log(`OK product=${p.id} mlb=${mlb} url=${finalUrl}`);
    }

    return res.status(200).json({
      ok: true,
      scanned,
      targets: targets.length,
      resolved,
      updated,
    });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}
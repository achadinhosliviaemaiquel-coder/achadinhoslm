// api/cron/ml-resolve-sec.ts - Resolve links de afiliado ML e extrai MLB IDs
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";

const MAX_ITEMS = Number(process.env.ML_RESOLVE_MAX_ITEMS || "400");

function readHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function readCronSecret(req: VercelRequest): string {
  // 1. header x-cron-secret (legado/custom)
  const h = readHeader(req, "x-cron-secret");
  if (h) return h;

  // 2. Authorization: Bearer <secret> (mecanismo nativo Vercel CRON_SECRET)
  const auth = readHeader(req, "authorization");
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim();

  // 3. query param (dev local)
  try {
    const host = readHeader(req, "x-forwarded-host") || readHeader(req, "host");
    const proto =
      readHeader(req, "x-forwarded-proto") ||
      (host?.includes("localhost") ? "http" : "https");
    const url = new URL(req.url || "/", `${proto}://${host || "localhost"}`);
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

function isValidExternalId(id: string | null | undefined): id is string {
  if (!id) return false;
  return /^(MLBU|MLB)\d{6,14}$/i.test(id);
}

async function resolveFinalUrl(shortUrl: string): Promise<string> {
  try {
    const res = await fetch(shortUrl, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return res.url || shortUrl;
  } catch {
    return shortUrl;
  }
}

type ProductRow = {
  id: string;
  mercadolivre_link: string | null;
  source_url: string | null;
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

    // Busca produtos ativos com link do ML
    const { data: products, error: pErr } = await supabase
      .from("products")
      .select("id, mercadolivre_link, source_url")
      .eq("is_active", true)
      .not("mercadolivre_link", "is", null)
      .limit(MAX_ITEMS);

    if (pErr) throw pErr;

    // Busca quais produtos já têm external_id válido em store_offers (para pular)
    const { data: existingOffers } = await supabase
      .from("store_offers")
      .select("product_id, external_id")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true)
      .not("external_id", "is", null);

    const alreadyResolved = new Set(
      (existingOffers ?? [])
        .filter((o: any) => isValidExternalId(o.external_id))
        .map((o: any) => o.product_id as string),
    );

    const allTargets = (products as ProductRow[]).filter(
      (p) => (p.mercadolivre_link || "").trim().length > 0,
    );

    // Apenas processa produtos que ainda não têm external_id resolvido
    const targets = allTargets.filter((p) => !alreadyResolved.has(p.id));

    log(
      `scanned=${products?.length ?? 0} | alreadyResolved=${alreadyResolved.size} | toResolve=${targets.length}`,
    );

    let resolved = 0;
    let updated = 0;

    for (const p of targets) {
      const original = (p.mercadolivre_link || "").trim();
      const finalUrl = await resolveFinalUrl(original);

      const mlb = extractMlExternalId(finalUrl) || extractMlExternalId(p.source_url);

      if (!mlb) {
        log(`❌ MLB not found product=${p.id} url=${finalUrl}`);
        continue;
      }

      resolved++;

      // Atualiza link do produto para a URL final (sem redirect)
      if (finalUrl !== original) {
        await supabase
          .from("products")
          .update({ mercadolivre_link: finalUrl })
          .eq("id", p.id);
        updated++;
      }

      // Cria/atualiza entrada em store_offers
      await supabase.from("store_offers").upsert(
        {
          product_id: p.id,
          platform: PLATFORM_LABEL,
          external_id: mlb,
          url: finalUrl,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "product_id,platform" },
      );

      log(`✅ OK product=${p.id} mlb=${mlb}`);
    }

    return res.status(200).json({
      ok: true,
      scanned: allTargets.length,
      alreadyResolved: alreadyResolved.size,
      toResolve: targets.length,
      resolved,
      updated,
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}

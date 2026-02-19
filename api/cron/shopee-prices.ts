// api/cron/shopee-prices.ts - VERSÃO CORRIGIDA (sem catch duplicado)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type StoreOfferRow = {
  id: number;
  platform: string;
  is_active: boolean;
  url: string | null;
  external_id: string | null;
};

type JobCounters = {
  scanned: number;
  updated: number;
  failed: number;
  skippedMissingUrl: number;
  skippedBadUrl: number;
  apiErrors: number;
  resolvedShortLinks: number;
  savedExternalId: number;
  usedCachedExternalId: number;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID!;
const SHOPEE_SECRET = process.env.SHOPEE_SECRET!;
const SHOPEE_API_BASE =
  process.env.SHOPEE_API_BASE || "https://open-api.affiliate.shopee.com.br/graphql";

function requireEnv(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing env: ${name}`);
}

function sha256HexLower(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

function buildShopeeAuthHeader(payload: string, ts: number): string {
  const factor = `${SHOPEE_APP_ID}${ts}${payload}${SHOPEE_SECRET}`;
  const signature = sha256HexLower(factor);
  return `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${signature}`;
}

function parseShopeeIdsFromAnyUrl(url: string): { shopId: number; itemId: number } | null {
  let m = url.match(/\/product\/(\d+)\/(\d+)/i);
  if (m) return { shopId: Number(m[1]), itemId: Number(m[2]) };

  m = url.match(/\/opaanlp\/(\d+)\/(\d+)/i);
  if (m) return { shopId: Number(m[1]), itemId: Number(m[2]) };

  return null;
}

function parseExternalId(ext: string | null): { shopId: number; itemId: number } | null {
  if (!ext) return null;
  const m = ext.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { shopId: Number(m[1]), itemId: Number(m[2]) };
}

async function shopeeGraphQL<T>(query: string, variables: Record<string, any>): Promise<T> {
  const payload = JSON.stringify({ query, variables });
  const ts = Math.floor(Date.now() / 1000);
  const auth = buildShopeeAuthHeader(payload, ts);

  const res = await fetch(SHOPEE_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: auth,
    },
    body: payload,
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shopee HTTP ${res.status}: ${JSON.stringify(json)}`);
  if ((json as any)?.errors?.length) throw new Error(`Shopee GraphQL error: ${JSON.stringify((json as any).errors)}`);
  return json as T;
}

async function resolveFinalUrl(shortUrl: string): Promise<string> {
  try {
    const head = await fetch(shortUrl, { method: "HEAD", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
    return head.url || shortUrl;
  } catch {}

  const get = await fetch(shortUrl, { method: "GET", redirect: "follow", headers: { "User-Agent": "Mozilla/5.0" } });
  return get.url || shortUrl;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const debug = String(req.query.debug ?? "") === "1";

  try {
    requireEnv("SUPABASE_URL", SUPABASE_URL);
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
    requireEnv("CRON_SECRET", CRON_SECRET);
    requireEnv("SHOPEE_APP_ID", SHOPEE_APP_ID);
    requireEnv("SHOPEE_SECRET", SHOPEE_SECRET);

    const cronSecret = (req.query.cron_secret as string | undefined) ?? "";
    if (!cronSecret || cronSecret !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const counters: JobCounters = {
      scanned: 0,
      updated: 0,
      failed: 0,
      skippedMissingUrl: 0,
      skippedBadUrl: 0,
      apiErrors: 0,
      resolvedShortLinks: 0,
      savedExternalId: 0,
      usedCachedExternalId: 0,
    };

    const { data: offers, error: offersErr } = await supabase
      .from("store_offers")
      .select("id, platform, is_active, url, external_id")
      .eq("platform", "shopee")
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (offersErr) throw offersErr;

    const rows = (offers ?? []) as StoreOfferRow[];
    counters.scanned = rows.length;

    const gql = `
      query ($shopId: Int64!, $itemId: Int64!) {
        productOfferV2(shopId: $shopId, itemId: $itemId, page: 1, limit: 1) {
          nodes {
            itemId
            shopId
            price
            priceMin
            priceMax
          }
        }
      }
    `;

    for (const off of rows) {
      let finalUrl: string | null = null;
      let ids: { shopId: number; itemId: number } | null = null;

      try {
        if (!off.url) {
          counters.skippedMissingUrl++;
          continue;
        }

        ids = parseExternalId(off.external_id);
        if (ids) {
          counters.usedCachedExternalId++;
        } else {
          finalUrl = await resolveFinalUrl(off.url);
          counters.resolvedShortLinks++;

          ids = parseShopeeIdsFromAnyUrl(finalUrl);
          if (!ids) {
            counters.skippedBadUrl++;
            continue;
          }

          const ext = `${ids.shopId}:${ids.itemId}`;
          await supabase
            .from("store_offers")
            .update({ external_id: ext, updated_at: new Date().toISOString() })
            .eq("id", off.id);

          counters.savedExternalId++;
        }

        const resp = await shopeeGraphQL<any>(gql, {
          shopId: ids.shopId,
          itemId: ids.itemId,
        });

        const node = resp?.data?.productOfferV2?.nodes?.[0];
        if (!node) continue;

        const priceStr = (node.price ?? node.priceMin ?? "").toString();
        const price = Number(priceStr.replace(",", "."));
        if (!Number.isFinite(price) || price <= 0) continue;

        await supabase
          .from("store_offers")
          .update({
            price,
            currency: "BRL",
            updated_at: new Date().toISOString(),
          })
          .eq("id", off.id);

        counters.updated++;

      } catch (e: any) {
        counters.failed++;
        counters.apiErrors++;
        console.error(`Erro ao processar offer ${off.id}:`, e?.message);
      }
    }

    return res.status(200).json({ 
      ok: true, 
      offset, 
      limit, 
      counters,
      message: `Processados ${counters.scanned} ofertas, ${counters.updated} atualizadas.` 
    });

  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}
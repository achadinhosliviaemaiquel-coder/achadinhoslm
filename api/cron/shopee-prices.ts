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
  // Signature = SHA256(Credential + Timestamp + Payload + Secret)
  const factor = `${SHOPEE_APP_ID}${ts}${payload}${SHOPEE_SECRET}`;
  const signature = sha256HexLower(factor);
  return `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${signature}`;
}

function parseShopeeIdsFromProductLink(url: string): { shopId: number; itemId: number } | null {
  // Ex: https://shopee.com.br/product/526615488/23295973837
  const m = url.match(/\/product\/(\d+)\/(\d+)/i);
  if (!m) return null;
  const shopId = Number(m[1]);
  const itemId = Number(m[2]);
  if (!Number.isFinite(shopId) || !Number.isFinite(itemId)) return null;
  return { shopId, itemId };
}

async function shopeeGraphQL<T>(
  query: string,
  variables: Record<string, any>
): Promise<T> {
  const payload = JSON.stringify({ query, variables }); // IMPORTANTE: este texto é o que você assina e o que você envia
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

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Shopee HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json?.errors?.length) {
    // Ex: 10030 rate limit, 10020 invalid signature/ts, etc.
    throw new Error(`Shopee GraphQL error: ${JSON.stringify(json.errors)}`);
  }
  return json as T;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    requireEnv("SUPABASE_URL", SUPABASE_URL);
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);
    requireEnv("CRON_SECRET", CRON_SECRET);
    requireEnv("SHOPEE_APP_ID", SHOPEE_APP_ID);
    requireEnv("SHOPEE_SECRET", SHOPEE_SECRET);

    const cronSecret = (req.query.cron_secret as string | undefined) ?? "";
    if (!cronSecret || cronSecret !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized (invalid cron_secret)" });
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
    };

    // 1) busca offers Shopee ativos
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

    // 2) para cada offer, resolve shopId/itemId e busca preço atual
    const query = `
      query ($shopId: Int64!, $itemId: Int64!) {
        productOfferV2(shopId: $shopId, itemId: $itemId, page: 1, limit: 1) {
          nodes {
            itemId
            shopId
            price
            priceMin
            priceMax
            productLink
            offerLink
            periodStartTime
            periodEndTime
          }
        }
      }
    `;

    for (const off of rows) {
      try {
        if (!off.url) {
          counters.skippedMissingUrl++;
          continue;
        }

        const ids = parseShopeeIdsFromProductLink(off.url);
        if (!ids) {
          counters.skippedBadUrl++;
          continue;
        }

        type Resp = {
          data: {
            productOfferV2: {
              nodes: Array<{
                itemId: number;
                shopId: number;
                price?: string | null;
                priceMin?: string | null;
                priceMax?: string | null;
              }>;
            };
          };
        };

        const resp = await shopeeGraphQL<Resp>(query, {
          shopId: ids.shopId,
          itemId: ids.itemId,
        });

        const node = resp?.data?.productOfferV2?.nodes?.[0];
        if (!node) {
          // item pode ter saído do programa / não tem offer
          // aqui você pode decidir desativar is_active
          continue;
        }

        // prioridade: price (se vier), senão priceMin
        const priceStr = (node.price ?? node.priceMin ?? "").toString();
        const price = Number(priceStr.replace(",", "."));
        if (!Number.isFinite(price) || price <= 0) {
          continue;
        }

        const { error: updErr } = await supabase
          .from("store_offers")
          .update({
            price,
            currency: "BRL",
            updated_at: new Date().toISOString(),
          })
          .eq("id", off.id);

        if (updErr) throw updErr;
        counters.updated++;
      } catch (e: any) {
        counters.failed++;
        counters.apiErrors++;
        // segue o job; não mata tudo
      }
    }

    return res.status(200).json({
      ok: true,
      offset,
      limit,
      counters,
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}

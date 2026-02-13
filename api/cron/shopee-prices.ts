import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

type StoreOfferRow = {
  id: number;
  platform: string;
  is_active: boolean;
  url: string | null; // shortlink https://s.shopee.com.br/xxxx
  external_id: string | null; // "shopId:itemId"
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
  // Signature = SHA256(Credential + Timestamp + Payload + Secret)
  const factor = `${SHOPEE_APP_ID}${ts}${payload}${SHOPEE_SECRET}`;
  const signature = sha256HexLower(factor);
  return `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${ts}, Signature=${signature}`;
}

function parseShopeeIdsFromAnyUrl(url: string): { shopId: number; itemId: number } | null {
  // Formato 1: https://shopee.com.br/product/{shopId}/{itemId}
  let m = url.match(/\/product\/(\d+)\/(\d+)/i);
  if (m) {
    const shopId = Number(m[1]);
    const itemId = Number(m[2]);
    if (Number.isFinite(shopId) && Number.isFinite(itemId)) return { shopId, itemId };
  }

  // Formato 2 (o que você viu): https://shopee.com.br/opaanlp/{shopId}/{itemId}
  m = url.match(/\/opaanlp\/(\d+)\/(\d+)/i);
  if (m) {
    const shopId = Number(m[1]);
    const itemId = Number(m[2]);
    if (Number.isFinite(shopId) && Number.isFinite(itemId)) return { shopId, itemId };
  }

  return null;
}

function parseExternalId(ext: string | null): { shopId: number; itemId: number } | null {
  if (!ext) return null;
  // esperado: "shopId:itemId"
  const m = ext.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  const shopId = Number(m[1]);
  const itemId = Number(m[2]);
  if (!Number.isFinite(shopId) || !Number.isFinite(itemId)) return null;
  return { shopId, itemId };
}

async function shopeeGraphQL<T>(query: string, variables: Record<string, any>): Promise<T> {
  // IMPORTANTE: o payload assinado precisa ser exatamente o payload enviado
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
  if (!res.ok) {
    throw new Error(`Shopee HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if ((json as any)?.errors?.length) {
    throw new Error(`Shopee GraphQL error: ${JSON.stringify((json as any).errors)}`);
  }
  return json as T;
}

async function resolveFinalUrl(shortUrl: string): Promise<string> {
  // 1) tenta HEAD para pegar redirect sem baixar body
  try {
    const head = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "follow",
      // alguns CDNs reagem melhor com UA simples
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    return head.url || shortUrl;
  } catch {
    // ignore e tenta GET
  }

  // 2) fallback GET
  const get = await fetch(shortUrl, {
    method: "GET",
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0" },
  });
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
      resolvedShortLinks: 0,
      savedExternalId: 0,
      usedCachedExternalId: 0,
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

    const gql = `
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
      let finalUrl: string | null = null;
      let ids: { shopId: number; itemId: number } | null = null;

      try {
        if (!off.url) {
          counters.skippedMissingUrl++;
          continue;
        }

        // 0) tenta usar cache (external_id)
        ids = parseExternalId(off.external_id);
        if (ids) {
          counters.usedCachedExternalId++;
        } else {
          // 1) resolve shortlink -> final url
          finalUrl = await resolveFinalUrl(off.url);
          counters.resolvedShortLinks++;

          // 2) extrai ids do finalUrl
          ids = parseShopeeIdsFromAnyUrl(finalUrl);
          if (!ids) {
            counters.skippedBadUrl++;
            if (debug) {
              return res.status(200).json({
                ok: false,
                debug: {
                  offerId: off.id,
                  shortUrl: off.url,
                  finalUrl,
                  reason: "Could not parse shopId/itemId from finalUrl",
                },
              });
            }
            continue;
          }

          // 3) salva external_id para cache
          const ext = `${ids.shopId}:${ids.itemId}`;
          const { error: extErr } = await supabase
            .from("store_offers")
            .update({ external_id: ext, updated_at: new Date().toISOString() })
            .eq("id", off.id);

          if (!extErr) counters.savedExternalId++;
        }

        // 4) chama GraphQL com shopId/itemId
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

        const resp = await shopeeGraphQL<Resp>(gql, {
          shopId: ids.shopId,
          itemId: ids.itemId,
        });

        const node = resp?.data?.productOfferV2?.nodes?.[0];
        if (!node) {
          // sem offer (saiu do programa, etc). Aqui você pode desativar se quiser.
          continue;
        }

        const priceStr = (node.price ?? node.priceMin ?? "").toString();
        const price = Number(priceStr.replace(",", "."));
        if (!Number.isFinite(price) || price <= 0) {
          continue;
        }

        // 5) atualiza preço
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

        if (debug) {
          return res.status(200).json({
            ok: true,
            debug: {
              offerId: off.id,
              shortUrl: off.url,
              finalUrl: finalUrl ?? "(cache external_id)",
              parsedIds: ids,
              price,
            },
            counters,
          });
        }
      } catch (e: any) {
      } catch (e: any) {
        counters.failed++;
        counters.apiErrors++;

        if (debug) {
          return res.status(200).json({
            ok: false,
            debug: {
              offerId: off.id,
              shortUrl: off.url,
              finalUrl,
              parsedIds: ids,
              error: e?.message ?? String(e),
            },
            counters,
          });
        }
        // segue o job
      }
}

    return res.status(200).json({ ok: true, offset, limit, counters });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? String(e) });
  }
}

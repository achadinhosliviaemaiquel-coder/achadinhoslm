// api/cron/ml-prices.ts - API oficial ML (sem cookie)
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

type StoreOffer = {
  id: number;
  product_id: string;
  platform: string;
  external_id: string | null;
  ml_item_id: string | null;
  url: string | null;
  is_active: boolean;
  current_price_cents?: number | null;
  price_override_brl?: number | null;
};

type JobCounters = {
  scanned: number;
  updated: number;
  failed: number;
  invalidExternalIdSkipped: number;
  priceNotFound: number;
  timedOut: number;
};

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;
const PLATFORM_LABEL = process.env.ML_PLATFORM_LABEL || "mercadolivre";
const ML_CLIENT_ID = process.env.ML_CLIENT_ID!;
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET!;

const DEFAULT_LIMIT = Number(process.env.ML_PRICE_BATCH_SIZE || "10");
const MAX_CONCURRENCY = Number(process.env.ML_PRICE_CONCURRENCY || "1");
const MAX_RUN_MS = Number(process.env.ML_PRICE_MAX_RUN_MS || "45000");

function utcDateOnly(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseMlExternalId(externalId: string | null) {
  if (!externalId) return null;
  const m = externalId.match(/^(MLBU|MLB)(\d{6,14})$/i);
  if (!m) return null;
  return { prefix: m[1].toUpperCase() as "MLB" | "MLBU", digits: m[2], raw: `${m[1].toUpperCase()}${m[2]}` };
}

function isValidMLB(externalId: string | null): externalId is string {
  return !!parseMlExternalId(externalId);
}

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

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let i = 0;
  const runners = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (true) {
        const idx = i++;
        if (idx >= items.length) break;
        try {
          await worker(items[idx]);
        } catch {
          // erros individuais são capturados no worker
        }
      }
    });
  await Promise.all(runners);
}

/**
 * Obtém um token de aplicação via client_credentials.
 * Usado para acessar recursos públicos do ML (itens, busca).
 * Retorna null se o app não suportar este grant type.
 */
async function getMLAppToken(
  clientId: string,
  clientSecret: string,
  log?: (s: string) => void,
): Promise<string | null> {
  try {
    const res = await fetch("https://api.mercadolibre.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log?.(`WARN client_credentials status=${res.status}: ${body.slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    return (data.access_token as string) ?? null;
  } catch (e: any) {
    log?.(`WARN client_credentials erro: ${e?.message}`);
    return null;
  }
}

const ML_BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
};

/**
 * Faz fetch ao ML:
 * 1. Sem auth com cabeçalhos de browser (endpoints públicos)
 * 2. Com token OAuth do usuário + cabeçalhos de browser (fallback)
 */
async function mlFetch(url: string, userToken: string): Promise<Response> {
  const pubRes = await fetch(url, { headers: ML_BROWSER_HEADERS });
  if (pubRes.ok || (pubRes.status !== 401 && pubRes.status !== 403)) {
    return pubRes;
  }
  return fetch(url, {
    headers: { ...ML_BROWSER_HEADERS, Authorization: `Bearer ${userToken}` },
  });
}

/**
 * Busca preço do ML.
 * @param itemId   ID a usar no endpoint /items/ (pode ser ml_item_id ou external_id)
 * @param catalogId  ID do catálogo (external_id) para fallback de busca por catalog_product_id
 * @param userToken  Token OAuth do usuário (fallback se endpoint não for público)
 */
async function getPriceFromML(
  itemId: string,
  catalogId: string,
  userToken: string,
  log?: (s: string) => void,
): Promise<number | null> {
  // 1. Tenta endpoint /items/ (funciona para listings individuais; ml_item_id já resolvido)
  try {
    const res = await mlFetch(`https://api.mercadolibre.com/items/${itemId}`, userToken);
    if (res.ok) {
      const item = await res.json();
      if (item.price && item.price > 0) return item.price;
      log?.(`items OK mas price=0 para ${itemId}`);
    } else {
      log?.(`items status=${res.status} para ${itemId} — tentando catalog search`);
    }
  } catch (e: any) {
    log?.(`items erro para ${itemId}: ${e?.message}`);
  }

  // 2. Fallback: busca por catalog_product_id via search
  try {
    const res = await mlFetch(
      `https://api.mercadolibre.com/sites/MLB/search?catalog_product_id=${catalogId}&limit=1`,
      userToken,
    );
    if (res.ok) {
      const data = await res.json();
      const first = (data.results ?? [])[0];
      if (first?.price > 0) {
        log?.(`catalog search ${catalogId} → R$ ${first.price}`);
        return first.price;
      }
      log?.(`catalog search ${catalogId} sem resultados`);
    } else {
      log?.(`catalog search status=${res.status} para ${catalogId}`);
    }
  } catch (e: any) {
    log?.(`catalog search erro para ${catalogId}: ${e?.message}`);
  }

  // 3. Fallback: endpoint /products/ (catálogo ML — retorna buy_box_winner com preço)
  try {
    const res = await mlFetch(
      `https://api.mercadolibre.com/products/${catalogId}`,
      userToken,
    );
    if (res.ok) {
      const data = await res.json();
      const price =
        data.buy_box_winner?.price ??
        data.settings?.price ??
        null;
      if (price && price > 0) {
        log?.(`/products/${catalogId} → R$ ${price}`);
        return price;
      }
      log?.(`/products/${catalogId} OK mas sem preço`);
    } else {
      log?.(`/products/${catalogId} status=${res.status}`);
    }
  } catch (e: any) {
    log?.(`/products/${catalogId} erro: ${e?.message}`);
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const t0 = Date.now();
  const deadlineMs = t0 + MAX_RUN_MS;

  const logs: string[] = [];
  const log = (s: string) => {
    const line = `[ml-prices] ${new Date().toISOString()} ${s}`;
    logs.push(line);
    console.log(line);
  };

  const supabase = createClient<any>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const job: JobCounters = {
    scanned: 0,
    updated: 0,
    failed: 0,
    invalidExternalIdSkipped: 0,
    priceNotFound: 0,
    timedOut: 0,
  };

  let stoppedEarly = false;

  const got = readCronSecret(req);
  if (!got || got !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }

  const host =
    readHeader(req, "x-forwarded-host") ||
    readHeader(req, "host") ||
    "localhost";
  const proto =
    readHeader(req, "x-forwarded-proto") ||
    (host.includes("localhost") ? "http" : "https");
  const u = new URL(req.url || "/", `${proto}://${host}`);

  const offset = Math.max(0, Number(u.searchParams.get("offset") || "0") || 0);
  const limit = Math.max(
    1,
    Math.min(
      50,
      Number(u.searchParams.get("limit") || String(DEFAULT_LIMIT)) || DEFAULT_LIMIT,
    ),
  );

  try {
    // Busca token OAuth
    const { data: tokenRow } = await supabase
      .from("ml_oauth_tokens")
      .select("*")
      .order("id", { ascending: false })
      .limit(1)
      .single();

    if (!tokenRow) {
      throw new Error("Nenhum token encontrado. Rode /api/ml/oauth/start");
    }

    let accessToken = tokenRow.access_token;

    // Refresh automático se expirado
    if (new Date(tokenRow.expires_at) < new Date() && tokenRow.refresh_token) {
      log("Token expirado → refresh automático");
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
      if (!refreshRes.ok) throw new Error("Refresh falhou");

      accessToken = data.access_token;

      await supabase
        .from("ml_oauth_tokens")
        .update({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
        })
        .eq("id", tokenRow.id);

      log("Token renovado com sucesso");
    }

    // Verifica se o token de usuário funciona (health check)
    const tokenCheckRes = await fetch("https://api.mercadolibre.com/users/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!tokenCheckRes.ok) {
      const body = await tokenCheckRes.text().catch(() => "");
      log(`WARN token de usuário inválido (HTTP ${tokenCheckRes.status}): ${body.slice(0, 200)}`);
    } else {
      log("Token de usuário OK ✓");
    }

    // Tenta obter token de aplicação (client_credentials) como upgrade.
    // Se não disponível (app não suporta), usa o token de usuário como fallback.
    // Os endpoints de itens/busca do ML são públicos — tentativa sem auth é feita primeiro.
    const appToken = await getMLAppToken(ML_CLIENT_ID, ML_CLIENT_SECRET, log);
    const tokenForItems = appToken ?? (accessToken as string);
    log(
      appToken
        ? `App token (client_credentials) ✓ - offset=${offset} limit=${limit}`
        : `Usando token de usuário como fallback - offset=${offset} limit=${limit}`,
    );

    const { data: offers, error } = await supabase
      .from("store_offers")
      .select("id, product_id, platform, external_id, ml_item_id, url, is_active, current_price_cents, price_override_brl")
      .eq("platform", PLATFORM_LABEL)
      .eq("is_active", true)
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw new Error(`DB read error: ${error.message}`);

    const page = (offers ?? []) as StoreOffer[];
    const filtered = page.filter((o) => {
      if (!isValidMLB(o.external_id)) {
        job.invalidExternalIdSkipped += 1;
        return false;
      }
      return true;
    });

    log(`Page offers=${page.length} valid=${filtered.length} skipped=${job.invalidExternalIdSkipped}`);

    await runPool(filtered, MAX_CONCURRENCY, async (offer) => {
      job.scanned += 1;

      if (Date.now() > deadlineMs) {
        stoppedEarly = true;
        job.timedOut += 1;
        return;
      }

      const mlb = offer.external_id!;
      // Se ml_item_id estiver resolvido (produto de catálogo já processado pelo ml-resolve-sec),
      // usa-o como ID do endpoint /items/ — é o listing real, não o ID de catálogo
      const effectiveItemId = offer.ml_item_id || mlb;

      // Usa override manual se definido (não chama a API)
      let price: number | null;
      if (offer.price_override_brl != null && Number.isFinite(Number(offer.price_override_brl))) {
        price = Number(offer.price_override_brl);
        log(`Override manual para ${mlb}: R$ ${price}`);
      } else {
        const label = effectiveItemId !== mlb ? `${mlb} (item=${effectiveItemId})` : mlb;
        log(`Buscando preço para ${label}...`);
        price = await getPriceFromML(effectiveItemId, mlb, tokenForItems, log);
      }

      if (price === null) {
        job.priceNotFound += 1;
        const { error: failErr } = await supabase
          .from("store_offers")
          .update({ last_scrape_status: "price_not_found" })
          .eq("id", offer.id);
        if (failErr) log(`WARN store_offers fail-status ${mlb}: ${failErr.message}`);
        return;
      }

      // Salva snapshot de preço (offer_id = MLB external_id TEXT, chave da tabela)
      const { error: upsertErr } = await supabase
        .from("offer_last_price")
        .upsert(
          { offer_id: mlb, price, verified_date: utcDateOnly() },
          { onConflict: "offer_id" },
        );
      if (upsertErr) log(`WARN offer_last_price ${mlb}: ${upsertErr.message}`);

      // Atualiza store_offers com preço em centavos
      const { error: soErr } = await supabase
        .from("store_offers")
        .update({
          current_price_cents: Math.round(price * 100),
          current_currency: "BRL",
          last_scrape_status: "ok",
        })
        .eq("id", offer.id);
      if (soErr) log(`WARN store_offers update ${mlb}: ${soErr.message}`);

      // Atualiza preço direto no produto
      const { error: pErr } = await supabase
        .from("products")
        .update({ mercadolivre_price: price })
        .eq("id", offer.product_id);
      if (pErr) log(`WARN products update ${offer.product_id}: ${pErr.message}`);

      job.updated += 1;
      log(`OK ${mlb} → R$ ${price}`);
    });

    return res.status(200).json({
      ok: true,
      updated: job.updated,
      total: page.length,
      stoppedEarly,
      job,
      durationMs: Date.now() - t0,
      logs: logs.slice(-100),
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
}

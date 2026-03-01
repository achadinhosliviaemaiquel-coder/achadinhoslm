import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

type Platform = "shopee" | "mercadolivre" | "amazon";

type OfferRow = {
  product_id: string;
  platform: Platform;
  current_price_cents: number | null;
  is_active: boolean;
};

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

function formatBRL(n: number) {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function computeMinPriceLabel(
  prices: Array<number | null | undefined>,
): string | null {
  const valid = prices.filter(
    (p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0,
  );
  if (!valid.length) return null;
  return formatBRL(Math.min(...valid));
}

function toNumberOrNull(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startedAt = Date.now();
  const reqId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  try {
    if (req.method !== "POST" && req.method !== "GET") {
      return res.status(405).json({
        ok: false,
        error: "Method Not Allowed",
        allowed: ["GET", "POST"],
      });
    }

    const got = readCronSecret(req);
    if (!CRON_SECRET || !got || got !== CRON_SECRET) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "Missing SUPABASE env vars",
        reqId,
        ms: Date.now() - startedAt,
      });
    }

    console.log("[sync-products-prices] start", { reqId, method: req.method });

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 1) Buscar ofertas ativas com preço
    const { data: offers, error: offErr } = await supabase
      .from("store_offers")
      .select("product_id, platform, current_price_cents, is_active")
      .eq("is_active", true)
      .in("platform", ["shopee", "mercadolivre", "amazon"])
      .not("current_price_cents", "is", null);

    if (offErr) {
      console.error("[sync-products-prices] offers error", {
        reqId,
        message: offErr.message,
      });
      return res.status(500).json({
        ok: false,
        error: offErr.message,
        reqId,
        ms: Date.now() - startedAt,
      });
    }

    // 2) Agrupar por produto: menor preço por plataforma
    const byProduct = new Map<
      string,
      {
        shopee_price: number | null;
        mercadolivre_price: number | null;
        amazon_price: number | null;
      }
    >();

    for (const o of (offers || []) as OfferRow[]) {
      const pid = o.product_id;
      const cents = Number(o.current_price_cents);
      if (!pid) continue;
      if (!Number.isFinite(cents) || cents <= 0) continue;

      const price = cents / 100;
      const entry = byProduct.get(pid) ?? {
        shopee_price: null,
        mercadolivre_price: null,
        amazon_price: null,
      };

      if (o.platform === "shopee") {
        entry.shopee_price =
          entry.shopee_price == null
            ? price
            : Math.min(entry.shopee_price, price);
      } else if (o.platform === "mercadolivre") {
        entry.mercadolivre_price =
          entry.mercadolivre_price == null
            ? price
            : Math.min(entry.mercadolivre_price, price);
      } else if (o.platform === "amazon") {
        entry.amazon_price =
          entry.amazon_price == null
            ? price
            : Math.min(entry.amazon_price, price);
      }

      byProduct.set(pid, entry);
    }

    if (byProduct.size === 0) {
      return res.status(200).json({
        ok: true,
        updated_products: 0,
        updated_price_labels: 0,
        skipped_missing_products: 0,
        note: "No offers priced",
        reqId,
        ms: Date.now() - startedAt,
      });
    }

    // 3) Ler estado atual dos products para evitar update desnecessário
    const productIds = Array.from(byProduct.keys());
    const BATCH = 500;

    const currentById = new Map<
      string,
      {
        shopee_price: number | null;
        mercadolivre_price: number | null;
        amazon_price: number | null;
        price_label: string | null;
      }
    >();

    for (let i = 0; i < productIds.length; i += BATCH) {
      const batch = productIds.slice(i, i + BATCH);
      const { data: prows, error: pErr } = await supabase
        .from("products")
        .select(
          "id, shopee_price, mercadolivre_price, amazon_price, price_label",
        )
        .in("id", batch);

      if (pErr) {
        console.error("[sync-products-prices] products read error", {
          reqId,
          message: pErr.message,
        });
        return res.status(500).json({
          ok: false,
          error: pErr.message,
          reqId,
          ms: Date.now() - startedAt,
        });
      }

      for (const r of (prows || []) as any[]) {
        currentById.set(r.id, {
          shopee_price: toNumberOrNull(r.shopee_price),
          mercadolivre_price: toNumberOrNull(r.mercadolivre_price),
          amazon_price: toNumberOrNull(r.amazon_price),
          price_label: (r.price_label ?? null) as string | null,
        });
      }
    }

    // 4) Gerar updates (apenas se mudou) — e IGNORA produtos inexistentes
    const updates: Array<{
      id: string;
      shopee_price?: number | null;
      mercadolivre_price?: number | null;
      amazon_price?: number | null;
      price_label?: string | null;
    }> = [];

    let skippedMissing = 0;

    for (const [id, next] of byProduct.entries()) {
      const curr = currentById.get(id);

      // produto não existe em products -> não atualiza (evita INSERT / NOT NULL)
      if (!curr) {
        skippedMissing++;
        continue;
      }

      const nextLabel = computeMinPriceLabel([
        next.shopee_price,
        next.mercadolivre_price,
        next.amazon_price,
      ]);

      const changed =
        curr.shopee_price !== next.shopee_price ||
        curr.mercadolivre_price !== next.mercadolivre_price ||
        curr.amazon_price !== next.amazon_price ||
        String(curr.price_label ?? "").trim() !==
          String(nextLabel ?? "").trim();

      if (!changed) continue;

      updates.push({
        id,
        shopee_price: next.shopee_price,
        mercadolivre_price: next.mercadolivre_price,
        amazon_price: next.amazon_price,
        price_label: nextLabel,
      });
    }

    if (updates.length === 0) {
      return res.status(200).json({
        ok: true,
        updated_products: 0,
        updated_price_labels: 0,
        skipped_missing_products: skippedMissing,
        note: "No changes",
        reqId,
        ms: Date.now() - startedAt,
      });
    }

    // 5) UPDATE (não UPSERT) em chunks
    const CHUNK = 200;
    let updated = 0;

    for (let i = 0; i < updates.length; i += CHUNK) {
      const chunk = updates.slice(i, i + CHUNK);

      for (const row of chunk) {
        const { id, ...patch } = row;

        // remove undefined (mantém null)
        Object.keys(patch).forEach((k) => {
          if ((patch as any)[k] === undefined) delete (patch as any)[k];
        });

        const { error: uErr } = await supabase
          .from("products")
          .update(patch)
          .eq("id", id);
        if (uErr) {
          console.error("[sync-products-prices] update error", {
            reqId,
            id,
            message: uErr.message,
          });
          return res.status(500).json({
            ok: false,
            error: uErr.message,
            product_id: id,
            reqId,
            ms: Date.now() - startedAt,
          });
        }

        updated += 1;
      }
    }

    console.log("[sync-products-prices] done", {
      reqId,
      updated,
      skippedMissing,
      ms: Date.now() - startedAt,
    });

    return res.status(200).json({
      ok: true,
      updated_products: updated,
      updated_price_labels: updated,
      skipped_missing_products: skippedMissing,
      reqId,
      ms: Date.now() - startedAt,
    });
  } catch (e: any) {
    console.error("[sync-products-prices] fatal", {
      reqId,
      message: e?.message,
      stack: e?.stack,
    });
    return res.status(500).json({
      ok: false,
      error: e?.message ?? "unknown error",
      reqId,
      ms: Date.now() - startedAt,
    });
  }
}

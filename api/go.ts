import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

function getServerSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function unwrapNestedGoUrl(raw: string): string {
  let current = (raw || "").trim();

  for (let i = 0; i < 2; i++) {
    if (!current) break;

    const isGo =
      current.startsWith("/api/go") ||
      (current.includes("://") &&
        (() => {
          try {
            const u = new URL(current);
            return u.pathname === "/api/go";
          } catch {
            return false;
          }
        })());

    if (!isGo) break;

    try {
      const u = new URL(current, "https://dummy.local");
      const inner = u.searchParams.get("url");
      if (!inner) return "";
      current = decodeURIComponent(inner);
    } catch {
      return "";
    }
  }

  return current;
}

function isSafeHttpUrl(raw: string) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isUuidLike(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

type AllowedStore = "mercadolivre" | "shopee" | "amazon";
function normalizeStore(v: string): AllowedStore | null {
  const s = (v || "").trim().toLowerCase();
  if (s === "mercadolivre" || s === "shopee" || s === "amazon") return s;
  return null;
}

type Traffic = "ads" | "organic";

type UTMFields = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  fbclid: string | null;
  gclid: string | null;
  ttclid: string | null;
};

function safeTrunc(v: string | null | undefined, max = 500) {
  const s = (v ?? "").toString();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * Lê UTMs do request URL (querystring) e, se não houver, tenta do Referer.
 * Isso faz o /go/... ?utm_... funcionar mesmo quando o Referer não tem UTMs.
 */
function parseUtmFromRequest(req: VercelRequest): UTMFields {
  const empty: UTMFields = {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    fbclid: null,
    gclid: null,
    ttclid: null,
  };

  // 1) querystring do próprio request
  try {
    const host = String(req.headers.host || "dummy.local");
    const proto =
      (String(req.headers["x-forwarded-proto"] || "") || "https")
        .split(",")[0]
        .trim() || "https";

    const u = new URL(req.url || "", `${proto}://${host}`);
    const sp = u.searchParams;

    const fromQuery: UTMFields = {
      utm_source: sp.get("utm_source"),
      utm_medium: sp.get("utm_medium"),
      utm_campaign: sp.get("utm_campaign"),
      utm_content: sp.get("utm_content"),
      utm_term: sp.get("utm_term"),
      fbclid: sp.get("fbclid"),
      gclid: sp.get("gclid"),
      ttclid: sp.get("ttclid"),
    };

    const hasAny =
      !!fromQuery.utm_source ||
      !!fromQuery.utm_medium ||
      !!fromQuery.utm_campaign ||
      !!fromQuery.utm_content ||
      !!fromQuery.utm_term ||
      !!fromQuery.fbclid ||
      !!fromQuery.gclid ||
      !!fromQuery.ttclid;

    if (hasAny) return fromQuery;
  } catch {
    // ignore
  }

  // 2) fallback: tenta do referer
  const referer =
    (req.headers.referer as string) ?? (req.headers.referrer as string) ?? null;

  if (!referer) return empty;

  try {
    const u = new URL(referer, "https://dummy.local");
    const sp = u.searchParams;
    return {
      utm_source: sp.get("utm_source"),
      utm_medium: sp.get("utm_medium"),
      utm_campaign: sp.get("utm_campaign"),
      utm_content: sp.get("utm_content"),
      utm_term: sp.get("utm_term"),
      fbclid: sp.get("fbclid"),
      gclid: sp.get("gclid"),
      ttclid: sp.get("ttclid"),
    };
  } catch {
    return empty;
  }
}

/**
 * Classifica traffic (ads vs organic) a partir de:
 * - UTMs (do request query OU referer)
 * - clids (fbclid/gclid/ttclid)
 * - user-agent in-app (FB/IG/TikTok - best effort)
 * - referer de FB/IG/TikTok
 */
function detectTrafficFromRequest(
  req: VercelRequest,
  uaRaw: string | null | undefined,
  referer: string | null,
): Traffic {
  const ua = String(uaRaw ?? "");
  const utm = parseUtmFromRequest(req);

  const utmMedium = (utm.utm_medium || "").toLowerCase();
  const utmSource = (utm.utm_source || "").toLowerCase();

  const looksLikePaid =
    utmMedium === "paid" ||
    utmMedium === "cpc" ||
    utmMedium === "ads" ||
    utmMedium === "paid_social" ||
    utmMedium === "social_paid";

  const looksLikeFbIg =
    utmSource === "fb" ||
    utmSource === "facebook" ||
    utmSource === "ig" ||
    utmSource === "instagram";

  const looksLikeTikTok =
    utmSource === "tt" || utmSource === "tiktok" || utmSource === "tik_tok";

  const uaLower = ua.toLowerCase();
  const uaIsFbIgInApp =
    ua.includes("FBAV") ||
    ua.includes("FB_IAB") ||
    ua.toLowerCase().includes("instagram");

  const uaIsTikTokInApp =
    ua.toLowerCase().includes("tiktok") ||
    ua.toLowerCase().includes("ttwebview") ||
    ua.toLowerCase().includes("bytedance") ||
    ua.toLowerCase().includes("musical_ly") ||
    ua.toLowerCase().includes("musically");

  const refIsFbIg =
    (referer || "").includes("facebook.com") ||
    (referer || "").includes("l.facebook.com") ||
    (referer || "").includes("instagram.com") ||
    (referer || "").includes("l.instagram.com");

  const refIsTikTok =
    (referer || "").includes("tiktok.com") ||
    (referer || "").includes("vm.tiktok.com") ||
    (referer || "").includes("m.tiktok.com") ||
    (referer || "").includes("ads.tiktok.com");

  if (
    hasClid ||
    looksLikePaid ||
    looksLikeFbIg ||
    uaIsFbIgInApp ||
    refIsFbIg ||
    uaIsTikTokInApp ||
    refIsTikTok
  )
    return "ads";
  return "organic";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ---- NEW MODE: /api/go?offer_id=123
  const offer_id_raw = String(req.query.offer_id || "").trim();

  // ---- SLUG MODE: /api/go?store=mercadolivre&slug=...  (vindo do /go/:store/:slug)
  const slug_raw = String(req.query.slug || "").trim();

  // ---- LEGACY MODE: /api/go?url=...&product_id=...&store=...
  const rawUrl = String(req.query.url || "");
  const product_id_raw = String(req.query.product_id || "");
  const store_raw = String(req.query.store || "");

  // ---- shared
  const session_id = safeTrunc(String(req.query.session_id || ""), 200) || null;
  const referer =
    safeTrunc(
      (req.headers.referer as string) ??
        (req.headers.referrer as string) ??
        null,
      1000,
    ) ?? null;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");

  const supabase = getServerSupabase();
  const nowIso = new Date().toISOString();

  const redirect = (to: string, trackedHeader: "1" | "0") => {
    res.setHeader("X-Tracking-Outbound", trackedHeader);
    res.writeHead(302, { Location: to });
    return res.end();
  };

  // Helper: registra também em product_clicks (outbound) para funil/traffic
  async function mirrorOutboundToClicks(args: {
    product_id: string;
    store: AllowedStore;
    session_id: string | null;
    referer: string | null;
    final_url: string;
  }) {
    if (!supabase) return;

    const ua =
      safeTrunc((req.headers["user-agent"] as string) ?? null, 500) ?? null;
    const traffic = detectTrafficFromRequest(req, ua, args.referer);
    const utm = parseUtmFromRequest(req);

    // ✅ NÃO enviar colunas que podem não existir (evita PGRST204 quebrar o /go)
    const payload: Record<string, any> = {
      kind: "outbound",
      product_id: args.product_id,
      store: args.store,
      created_at: nowIso,
      user_agent: ua,
      referrer: args.referer,
      referer: args.referer,
      session_id: args.session_id,
      traffic,
      origin: "go",
      outbound_url: args.final_url,
    };

    // UTMs/clids são ótimos, mas só envie se a tabela tiver as colunas.
    // Se você já criou essas colunas em product_clicks, pode habilitar aqui.
    // Caso contrário, deixe comentado para não derrubar o endpoint.
    //
    // payload.utm_source = utm.utm_source;
    // payload.utm_medium = utm.utm_medium;
    // payload.utm_campaign = utm.utm_campaign;
    // payload.utm_content = utm.utm_content;
    // payload.utm_term = utm.utm_term;
    // payload.fbclid = utm.fbclid;
    // payload.gclid = utm.gclid;
    // payload.ttclid = utm.ttclid;

    try {
      const { error } = await supabase.from("product_clicks").insert(payload);
      if (error) {
        console.error(
          "[/api/go] mirror product_clicks outbound insert error:",
          error,
        );
      }
    } catch (e) {
      console.error("[/api/go] mirror product_clicks outbound exception:", e);
    }
  }

  // ===========================
  // MODE SLUG: resolve slug -> product_id -> offer_id, then fall through to MODE A
  // ===========================
  if (slug_raw) {
    const storeFromSlug = normalizeStore(store_raw);
    if (!storeFromSlug) return res.status(400).send("Invalid store");

    if (!supabase) {
      console.error("[/api/go] Missing Supabase envs (slug)");
      return res.status(500).send("Tracking unavailable");
    }

    const { data: prod, error: prodErr } = await supabase
      .from("products")
      .select("id")
      .eq("slug", slug_raw)
      .maybeSingle();

    if (prodErr) {
      console.error("[/api/go] product slug lookup error:", prodErr);
      return res.status(500).send("Product lookup failed");
    }
    if (!prod?.id) return res.status(404).send("Product not found");

    const { data: offer, error: offerErr } = await supabase
      .from("store_offers")
      .select("id")
      .eq("product_id", prod.id)
      .eq("platform", storeFromSlug)
      .eq("is_active", true)
      // ajuste se seu critério de "melhor oferta" for outro:
      .order("price", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (offerErr) {
      console.error("[/api/go] offer lookup error (slug):", offerErr);
      return res.status(500).send("Offer lookup failed");
    }
    if (!offer?.id) return res.status(404).send("Offer not found");

    // injeta offer_id e segue para o MODE A logo abaixo
    (req.query as any).offer_id = String(offer.id);
  }

  // ===========================
  // MODE A: offer_id
  // ===========================
  const offer_id_effective = String(req.query.offer_id || "").trim();
  if (offer_id_effective) {
    const offer_id_num = Number(offer_id_effective);
    if (!Number.isFinite(offer_id_num) || offer_id_num <= 0) {
      return res.status(400).send("Invalid offer_id");
    }

    if (!supabase) {
      console.error("[/api/go] Missing Supabase envs (offer_id)");
      return res.status(500).send("Tracking unavailable");
    }

    const { data: offer, error: offerErr } = await supabase
      .from("store_offers")
      .select("id, product_id, platform, url")
      .eq("id", offer_id_num)
      .eq("is_active", true)
      .maybeSingle();

    if (offerErr) {
      console.error("[/api/go] Offer lookup error:", offerErr);
      return res.status(500).send("Offer lookup failed");
    }
    if (!offer) return res.status(404).send("Offer not found");

    const store = normalizeStore(String(offer.platform || ""));
    if (!store) return res.status(400).send("Invalid offer store");

    const finalUrl =
      unwrapNestedGoUrl(String(offer.url || "")) || String(offer.url || "");
    if (!finalUrl || !isSafeHttpUrl(finalUrl)) {
      return res.status(400).send("Invalid offer url");
    }

    // best-effort price snapshot
    let price_at_click: number | null = null;
    let currency_at_click: string | null = null;
    let price_verified_date: string | null = null;

    try {
      const { data: lp } = await supabase
        .from("offer_last_price")
        .select("price, currency, verified_date")
        .eq("offer_id", offer_id_num)
        .maybeSingle();

      if (lp) {
        price_at_click = (lp as any).price ?? null;
        currency_at_click = (lp as any).currency ?? null;
        price_verified_date = (lp as any).verified_date ?? null;
      }
    } catch {
      // ignore
    }

    let tracked = false;
    try {
      const ua =
        safeTrunc((req.headers["user-agent"] as string) ?? null, 500) ?? null;
      const utm = parseUtmFromRequest(req);
      const traffic = detectTrafficFromRequest(req, ua, referer);

      const { error } = await supabase.from("product_outbounds").insert({
        product_id: offer.product_id,
        store: offer.platform,
        offer_id: offer_id_num,
        price_at_click,
        currency_at_click,
        price_verified_date,
        session_id,
        referer,
        user_agent: ua,
        created_at: nowIso,

        traffic,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_content: utm.utm_content,
        utm_term: utm.utm_term,
        fbclid: utm.fbclid,
        gclid: utm.gclid,
        ttclid: utm.ttclid,
      });

      tracked = !error;
      if (error) console.error("[/api/go] outbound insert error:", error);
    } catch (e) {
      console.error("[/api/go] outbound exception:", e);
    }

    // espelha no funil (product_clicks.kind='outbound' com traffic)
    await mirrorOutboundToClicks({
      product_id: offer.product_id,
      store,
      session_id,
      referer,
      final_url: finalUrl,
    });

    return redirect(finalUrl, tracked ? "1" : "0");
  }

  // ===========================
  // MODE B: legacy
  // ===========================
  const store = normalizeStore(store_raw);
  const product_id = product_id_raw.trim();

  if (!rawUrl || !product_id || !store) {
    return res.status(400).send("Missing params");
  }
  if (!isUuidLike(product_id)) {
    return res.status(400).send("Invalid product_id");
  }

  const finalUrl = unwrapNestedGoUrl(rawUrl);
  if (!finalUrl || !isSafeHttpUrl(finalUrl)) {
    return res.status(400).send("Invalid url");
  }

  if (!supabase) {
    console.error("[/api/go] Missing Supabase envs (legacy)");
    return redirect(finalUrl, "0");
  }

  let tracked = false;
  try {
    const ua =
      safeTrunc((req.headers["user-agent"] as string) ?? null, 500) ?? null;
    const utm = parseUtmFromRequest(req);
    const traffic = detectTrafficFromRequest(req, ua, referer);

    const { error } = await supabase.from("product_outbounds").insert({
      product_id,
      store,
      session_id,
      referer,
      user_agent: ua,
      created_at: nowIso,

      traffic,
      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
      fbclid: utm.fbclid,
      gclid: utm.gclid,
      ttclid: utm.ttclid,
    });

    tracked = !error;
    if (error)
      console.error("[/api/go] outbound insert error (legacy):", error);
  } catch (e) {
    console.error("[/api/go] outbound exception (legacy):", e);
  }

  // espelha no funil (product_clicks.kind='outbound' com traffic)
  await mirrorOutboundToClicks({
    product_id,
    store,
    session_id,
    referer,
    final_url: finalUrl,
  });

  return redirect(finalUrl, tracked ? "1" : "0");
}

// api/go.ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

function pickString(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function getHeader(req: VercelRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] ?? "";
  return (v as string | undefined) ?? "";
}

function getReferer(req: VercelRequest): string | null {
  return (
    safeTrunc(
      (req.headers.referer as string) ??
        (req.headers.referrer as string) ??
        null,
      1000,
    ) ?? null
  );
}

/**
 * Lê UTMs do request URL (querystring) e, se não houver, tenta do Referer.
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
    const host = String(getHeader(req, "x-forwarded-host") || req.headers.host || "dummy.local");
    const proto =
      (String(getHeader(req, "x-forwarded-proto") || "https")
        .split(",")[0]
        .trim() || "https");

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
  const referer = getReferer(req);
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
 * Classifica traffic (ads vs organic)
 */
function detectTrafficFromRequest(
  req: VercelRequest,
  uaRaw: string | null | undefined,
  referer: string | null,
): Traffic {
  const ua = String(uaRaw ?? "");
  const utm = parseUtmFromRequest(req);

  const hasClid = !!utm.fbclid || !!utm.gclid || !!utm.ttclid;

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
    looksLikeTikTok ||
    uaIsFbIgInApp ||
    uaIsTikTokInApp ||
    refIsFbIg ||
    refIsTikTok
  ) {
    return "ads";
  }

  return "organic";
}

/**
 * Pra suportar o filtro "plataforma" no Admin:
 * preenche campos (se existirem no banco):
 * - referrer (domínio do referer)
 * - utm_source
 * - page_url (idealmente URL da página do seu site onde ocorreu o clique; fallback = referer)
 */
function guessPlatformFromSignals(args: {
  referrer: string | null;
  utm: UTMFields;
  page_url: string | null;
}): string {
  const ref = (args.referrer || "").toLowerCase();
  const page = (args.page_url || "").toLowerCase();
  const src = (args.utm.utm_source || "").toLowerCase();

  const has = (s: string) => ref.includes(s) || page.includes(s);

  if (src.match(/(facebook|fb|meta)/)) return "facebook";
  if (src.match(/(instagram|ig)/)) return "instagram";
  if (src.match(/(tiktok|tt|tik_tok)/)) return "tiktok";
  if (src.match(/(google|gads|adwords)/)) return "google";

  if (has("tiktok.com") || args.utm.ttclid) return "tiktok";
  if (has("instagram.com")) return "instagram";
  if (
    has("facebook.com") ||
    has("fb.com") ||
    has("m.facebook.com") ||
    has("l.facebook.com") ||
    args.utm.fbclid
  )
    return "facebook";
  if (has("google.") || args.utm.gclid) return "google";

  return "unknown";
}

/**
 * Extrai a coluna faltante do erro PGRST204:
 * "Could not find the 'page_url' column of 'product_outbounds' in the schema cache"
 */
function extractMissingColumnFromPgrst204(message?: string): string | null {
  if (!message) return null;
  const m = message.match(/Could not find the '([^']+)' column/);
  return m?.[1] ?? null;
}

/**
 * Inserção best-effort sem introspecção (SEM information_schema):
 * - tenta inserir payload completo
 * - se der PGRST204, remove a coluna faltante e tenta de novo
 * - repete até maxRetries (pra lidar com múltiplas colunas opcionais)
 */
async function safeInsertNoIntrospection(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, any>,
  logPrefix: string,
  maxRetries = 5,
) {
  const clean: Record<string, any> = { ...payload };
  Object.keys(clean).forEach((k) => {
    if (clean[k] === undefined) delete clean[k];
  });

  let current = clean;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await supabase.from(table).insert(current);
    if (!r.error) return;

    const code = (r.error as any)?.code;
    if (code !== "PGRST204") {
      console.error(`${logPrefix} insert error:`, {
        message: r.error.message,
        code,
        details: (r.error as any).details,
        hint: (r.error as any).hint,
      });
      return;
    }

    const missing = extractMissingColumnFromPgrst204(r.error.message);
    if (!missing || !(missing in current)) {
      console.error(`${logPrefix} insert PGRST204 but could not sanitize:`, {
        message: r.error.message,
        code,
      });
      return;
    }

    // remove a coluna que não existe e tenta novamente
    const next = { ...current };
    delete next[missing];
    current = next;

    if (attempt === maxRetries) {
      console.error(`${logPrefix} insert failed after retries (missing columns). Last missing: ${missing}`);
      return;
    }
  }
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
  const referer = getReferer(req);

  // Para suportar filtro plataforma: ideal é o client mandar page_url
  // ex: /api/go?...&page_url=${encodeURIComponent(location.href)}
  const page_url =
    safeTrunc(pickString(req.query.page_url) ?? "", 1500) ||
    // fallback: a URL anterior (referer) normalmente é a ProductPage do seu site
    referer ||
    null;

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade");

  const supabase = getServerSupabase();
  const nowIso = new Date().toISOString();

  const redirect = (to: string, trackedHeader: "1" | "0") => {
    res.setHeader("X-Tracking-Outbound", trackedHeader);
    res.writeHead(302, { Location: to });
    return res.end();
  };

  // Helper: fallback link do products por store
  function productFallbackUrl(prod: any, store: AllowedStore): string | null {
    if (!prod) return null;
    const v =
      store === "shopee"
        ? prod.shopee_link
        : store === "mercadolivre"
          ? prod.mercadolivre_link
          : prod.amazon_link;
    if (typeof v !== "string") return null;
    const t = v.trim();
    return t ? t : null;
  }

  // Helper: registra também em product_clicks (outbound) para funil/traffic + plataforma
  async function mirrorOutboundToClicks(args: {
    product_id: string;
    store: AllowedStore;
    session_id: string | null;
    referer: string | null;
    final_url: string;
  }) {
    if (!supabase) return;

    const ua = safeTrunc((req.headers["user-agent"] as string) ?? null, 500) ?? null;
    const traffic = detectTrafficFromRequest(req, ua, args.referer);
    const utm = parseUtmFromRequest(req);

    const platform = guessPlatformFromSignals({
      referrer: args.referer,
      utm,
      page_url,
    });

    const payload: Record<string, any> = {
      kind: "outbound",
      product_id: args.product_id,
      store: args.store,
      created_at: nowIso,
      user_agent: ua,
      referer: args.referer,
      referrer: args.referer,
      session_id: args.session_id,
      traffic,
      origin: "go",
      outbound_url: args.final_url,

      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
      fbclid: utm.fbclid,
      gclid: utm.gclid,
      ttclid: utm.ttclid,

      page_url,
      platform, // só salva se existir coluna
    };

    try {
      await safeInsertNoIntrospection(
        supabase as SupabaseClient,
        "product_clicks",
        payload,
        "[/api/go] mirror product_clicks",
        6,
      );
    } catch (e) {
      console.error("[/api/go] mirror product_clicks outbound exception:", e);
    }
  }

  // ===========================
  // MODE SLUG
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
      .select("id, shopee_link, mercadolivre_link, amazon_link")
      .eq("slug", slug_raw)
      .maybeSingle();

    if (prodErr) {
      console.error("[/api/go] product slug lookup error:", prodErr);
      return res.status(500).send("Product lookup failed");
    }
    if (!prod?.id) return res.status(404).send("Product not found");

    const { data: offer, error: offerErr } = await supabase
      .from("store_offers")
      .select("id, url")
      .eq("product_id", prod.id)
      .eq("platform", storeFromSlug)
      .eq("is_active", true)
      .not("url", "is", null)
      .order("priority_boost", { ascending: false, nullsFirst: false })
      .order("current_price_cents", { ascending: true, nullsFirst: false })
      .order("updated_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (offerErr) {
      console.error("[/api/go] offer lookup error (slug) -> fallback:", offerErr);
      const fb = productFallbackUrl(prod, storeFromSlug);
      if (fb) return redirect(fb, "0");
      return res.status(500).send("Offer lookup failed");
    }

    if (!offer?.id) {
      const fb = productFallbackUrl(prod, storeFromSlug);
      if (fb) return redirect(fb, "0");
      return res.status(404).send("Offer not found");
    }

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

    // best-effort price snapshot (mantido)
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

    // Tracking outbound (best-effort, sem quebrar redirect)
    let tracked = false;
    try {
      const ua = safeTrunc((req.headers["user-agent"] as string) ?? null, 500) ?? null;
      const utm = parseUtmFromRequest(req);
      const traffic = detectTrafficFromRequest(req, ua, referer);

      await safeInsertNoIntrospection(
        supabase as SupabaseClient,
        "product_outbounds",
        {
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

          // ✅ se não existir, será removido automaticamente via PGRST204
          page_url,
        },
        "[/api/go] outbound",
        6,
      );

      tracked = true;
    } catch (e) {
      console.error("[/api/go] outbound exception:", e);
    }

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
    const ua = safeTrunc((req.headers["user-agent"] as string) ?? null, 500) ?? null;
    const utm = parseUtmFromRequest(req);
    const traffic = detectTrafficFromRequest(req, ua, referer);

    await safeInsertNoIntrospection(
      supabase as SupabaseClient,
      "product_outbounds",
      {
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

        page_url, // pode não existir -> retry remove
      },
      "[/api/go] outbound (legacy)",
      6,
    );

    tracked = true;
  } catch (e) {
    console.error("[/api/go] outbound exception (legacy):", e);
  }

  await mirrorOutboundToClicks({
    product_id,
    store,
    session_id,
    referer,
    final_url: finalUrl,
  });

  return redirect(finalUrl, tracked ? "1" : "0");
}

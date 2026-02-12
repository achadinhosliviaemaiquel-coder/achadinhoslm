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

function parseUtmFromReferer(referer: string | null): UTMFields {
  if (!referer) {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      fbclid: null,
      gclid: null,
      ttclid: null,
    };
  }

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
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      fbclid: null,
      gclid: null,
      ttclid: null,
    };
  }
}

/**
 * Classifica traffic a partir do referer + user-agent (mesma lógica do intent.ts)
 */
function detectTrafficFromRequest(
  uaRaw: string | null | undefined,
  referer: string | null,
): Traffic {
  const ua = String(uaRaw ?? "");
  const utm = parseUtmFromReferer(referer);

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

  const uaIsFbIgInApp =
    ua.includes("FBAV") ||
    ua.includes("FB_IAB") ||
    ua.toLowerCase().includes("instagram");

  const hasClid = Boolean(utm.fbclid || utm.gclid || utm.ttclid);

  const refIsFbIg =
    (referer || "").includes("facebook.com") ||
    (referer || "").includes("l.facebook.com") ||
    (referer || "").includes("instagram.com");

  if (hasClid || looksLikePaid || looksLikeFbIg || uaIsFbIgInApp || refIsFbIg)
    return "ads";
  return "organic";
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ---- NEW MODE: /api/go?offer_id=123
  const offer_id_raw = String(req.query.offer_id || "").trim();

  // ---- LEGACY MODE: /api/go?url=...&product_id=...&store=...
  const rawUrl = String(req.query.url || "");
  const product_id_raw = String(req.query.product_id || "");
  const store_raw = String(req.query.store || "");

  // ---- shared
  const session_id = String(req.query.session_id || "") || null;
  const referer =
    (req.headers.referer as string) ?? (req.headers.referrer as string) ?? null;

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

    const ua = (req.headers["user-agent"] as string) ?? null;
    const traffic = detectTrafficFromRequest(ua, args.referer);
    const utm = parseUtmFromReferer(args.referer);

    try {
      const { error } = await supabase.from("product_clicks").insert({
        kind: "outbound",
        product_id: args.product_id,
        store: args.store,
        created_at: nowIso,

        // ✅ usa o mesmo UA já normalizado
        user_agent: ua,

        referrer: args.referer,
        referer: args.referer,
        session_id: args.session_id,
        traffic,
        origin: "go",

        // ✅ UTMs (e você pode incluir os demais campos se existirem)
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_content: utm.utm_content,
        utm_term: utm.utm_term,
        fbclid: utm.fbclid,
        gclid: utm.gclid,
        ttclid: utm.ttclid,

        // ✅ URL externa final (não /api/go)
        outbound_url: args.final_url,
      });

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
  // MODE A: offer_id
  // ===========================
  if (offer_id_raw) {
    const offer_id_num = Number(offer_id_raw);
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
    } catch {}

    let tracked = false;
    try {
      const ua = (req.headers["user-agent"] as string) ?? null;
      const utm = parseUtmFromReferer(referer);
      const traffic = detectTrafficFromRequest(ua, referer);

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

        // ✅ NOVO (precisa existir na tabela)
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

    // espelha no funil (product_clicks.kind='outbound' com traffic/utm)
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
    const ua = (req.headers["user-agent"] as string) ?? null;
    const utm = parseUtmFromReferer(referer);
    const traffic = detectTrafficFromRequest(ua, referer);

    const { error } = await supabase.from("product_outbounds").insert({
      product_id,
      store,
      session_id,
      referer,
      user_agent: ua,
      created_at: nowIso,

      // ✅ NOVO
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

  // espelha no funil (product_clicks.kind='outbound' com traffic/utm)
  await mirrorOutboundToClicks({
    product_id,
    store,
    session_id,
    referer,
    final_url: finalUrl,
  });

  return redirect(finalUrl, tracked ? "1" : "0");
}

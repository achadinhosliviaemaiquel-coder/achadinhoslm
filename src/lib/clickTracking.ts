// src/lib/clickTracking.ts

type Store = "shopee" | "mercadolivre" | "amazon"
export type Traffic = "ads" | "organic"

export type TrackBuyClickParams = {
  productId: string
  productSlug?: string
  category?: string
  store: Store
  price?: number // decimal (ex: 49.99)
  priceCents?: number // inteiro (ex: 4999) — preferencial
  outboundUrl?: string // opcional para debug/futuro
}

declare global {
  interface Window {
    gtag?: (...args: any[]) => void
  }
}

function isFinitePositive(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n > 0
}

function toPriceCentsFromDecimal(price?: number) {
  if (!isFinitePositive(price)) return null
  return Math.round(price * 100)
}

function resolvePriceFields(p: TrackBuyClickParams) {
  const cents =
    isFinitePositive(p.priceCents) ? Math.trunc(p.priceCents) : toPriceCentsFromDecimal(p.price) ?? null

  const priceStr =
    cents !== null && cents > 0
      ? (cents / 100).toFixed(2)
      : isFinitePositive(p.price)
        ? p.price.toFixed(2)
        : null

  return { price_cents: cents, price: priceStr }
}

/**
 * ============================
 * Traffic / UTM helpers
 * ============================
 */

type UTMFields = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  gclid: string | null
  ttclid: string | null
}

function emptyUtm(): UTMFields {
  return {
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    fbclid: null,
    gclid: null,
    ttclid: null,
  }
}

function readUtmFromLocation(): UTMFields {
  try {
    const sp = new URLSearchParams(window.location.search)
    return {
      utm_source: sp.get("utm_source"),
      utm_medium: sp.get("utm_medium"),
      utm_campaign: sp.get("utm_campaign"),
      utm_content: sp.get("utm_content"),
      utm_term: sp.get("utm_term"),
      fbclid: sp.get("fbclid"),
      gclid: sp.get("gclid"),
      ttclid: sp.get("ttclid"),
    }
  } catch {
    return emptyUtm()
  }
}

function readUtmFromReferrer(): UTMFields {
  try {
    const ref = typeof document !== "undefined" ? document.referrer || "" : ""
    if (!ref) return emptyUtm()

    const u = new URL(ref, "https://dummy.local")
    const sp = u.searchParams
    return {
      utm_source: sp.get("utm_source"),
      utm_medium: sp.get("utm_medium"),
      utm_campaign: sp.get("utm_campaign"),
      utm_content: sp.get("utm_content"),
      utm_term: sp.get("utm_term"),
      fbclid: sp.get("fbclid"),
      gclid: sp.get("gclid"),
      ttclid: sp.get("ttclid"),
    }
  } catch {
    return emptyUtm()
  }
}

function hasAnyAttributionSignals(utm: UTMFields) {
  return Object.values(utm).some((v) => typeof v === "string" && v && v.length > 0)
}

function isFbIgInAppUA(ua: string) {
  const s = (ua || "").toLowerCase()
  return s.includes("fbav") || s.includes("fb_iab") || s.includes("instagram")
}

function isTikTokInAppUA(ua: string) {
  const s = (ua || "").toLowerCase()
  return (
    s.includes("tiktok") ||
    s.includes("ttwebview") ||
    s.includes("bytedancewebview") ||
    s.includes("bytedance") ||
    s.includes("musical_ly") ||
    s.includes("musically")
  )
}

function refLooksSocialAds(ref: string) {
  const s = (ref || "").toLowerCase()
  return (
    s.includes("facebook.com") ||
    s.includes("l.facebook.com") ||
    s.includes("instagram.com") ||
    s.includes("l.instagram.com") ||
    s.includes("tiktok.com") ||
    s.includes("vm.tiktok.com") ||
    s.includes("m.tiktok.com") ||
    s.includes("ads.tiktok.com")
  )
}

function detectTrafficFromSignals(utm: UTMFields): Traffic {
  const utmMedium = (utm.utm_medium || "").toLowerCase()
  const utmSource = (utm.utm_source || "").toLowerCase()

  const looksPaid =
    utmMedium === "paid" ||
    utmMedium === "cpc" ||
    utmMedium === "ads" ||
    utmMedium === "paid_social" ||
    utmMedium === "social_paid"

  // fontes sociais que você quer tratar como "ads" quando vier com sinais
  const looksSocial =
    utmSource === "fb" ||
    utmSource === "facebook" ||
    utmSource === "ig" ||
    utmSource === "instagram" ||
    utmSource === "tt" ||
    utmSource === "tiktok"

  const hasClickId = Boolean(utm.fbclid || utm.gclid || utm.ttclid)

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : ""
  const uaInApp = isFbIgInAppUA(ua) || isTikTokInAppUA(ua)

  const ref = typeof document !== "undefined" ? document.referrer || "" : ""
  const refInSocial = refLooksSocialAds(ref)

  // regra: se tem evidência de campanha/pago/clid/in-app/ref social => ads
  if (hasClickId || looksPaid || (looksSocial && (looksPaid || hasClickId)) || uaInApp || refInSocial) return "ads"
  return "organic"
}

const CTX_KEY = "bbg_traffic_ctx_v1"

type TrafficCtx = {
  traffic: Traffic
  utm: UTMFields
  expiresAt: number
}

function persistTrafficCtxIfUseful(ctx: TrafficCtx) {
  try {
    const hasAny = ctx.traffic === "ads" || hasAnyAttributionSignals(ctx.utm)
    if (!hasAny) return
    localStorage.setItem(CTX_KEY, JSON.stringify(ctx))
  } catch {
    // ignore
  }
}

function readTrafficCtx(): TrafficCtx | null {
  try {
    const raw = localStorage.getItem(CTX_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TrafficCtx
    if (!parsed?.expiresAt || Date.now() > parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

function mergeUtmPreferFirst(a: UTMFields, b: UTMFields): UTMFields {
  // mantém valores de "a" quando existirem; completa com "b"
  return {
    utm_source: a.utm_source ?? b.utm_source,
    utm_medium: a.utm_medium ?? b.utm_medium,
    utm_campaign: a.utm_campaign ?? b.utm_campaign,
    utm_content: a.utm_content ?? b.utm_content,
    utm_term: a.utm_term ?? b.utm_term,
    fbclid: a.fbclid ?? b.fbclid,
    gclid: a.gclid ?? b.gclid,
    ttclid: a.ttclid ?? b.ttclid,
  }
}

function resolveTrafficAndUtm(): { traffic: Traffic; utm: UTMFields } {
  // 1) prioridade: querystring atual
  const utmNow = readUtmFromLocation()

  // 2) fallback: referrer
  const utmRef = readUtmFromReferrer()

  // 3) combina: preferir query, completar com referrer
  const utmMerged = mergeUtmPreferFirst(utmNow, utmRef)

  const trafficNow = detectTrafficFromSignals(utmMerged)
  const hasSignalsNow = trafficNow === "ads" || hasAnyAttributionSignals(utmMerged)

  if (hasSignalsNow) {
    const ctx: TrafficCtx = {
      traffic: trafficNow,
      utm: utmMerged,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    }
    persistTrafficCtxIfUseful(ctx)
    return { traffic: trafficNow, utm: utmMerged }
  }

  const ctx = readTrafficCtx()
  if (ctx) return { traffic: ctx.traffic, utm: ctx.utm }

  return { traffic: "organic", utm: utmMerged }
}

/**
 * ✅ Chame isso em páginas de entrada (BridgePage/ProductPage)
 * para “plantar” o ctx de tráfego cedo (antes do clique).
 */
export function seedTrafficCtxFromUrl() {
  try {
    resolveTrafficAndUtm()
  } catch {
    // ignore
  }
}

function buildIntentPayload(p: TrackBuyClickParams) {
  const { price_cents, price } = resolvePriceFields(p)
  const { traffic, utm } = resolveTrafficAndUtm()

  return {
    kind: "intent",
    product_id: p.productId,
    store: p.store,
    product_slug: p.productSlug ?? null,
    category: p.category ?? null,
    traffic,

    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
    utm_term: utm.utm_term,
    fbclid: utm.fbclid,
    gclid: utm.gclid,
    ttclid: utm.ttclid,

    price_cents,
    price,

    outbound_url: p.outboundUrl ?? null,
  }
}

export function trackBuyClick(p: TrackBuyClickParams) {
  // 1) GA4
  try {
    const { traffic, utm } = resolveTrafficAndUtm()

    window.gtag?.("event", "affiliate_click", {
      product_id: p.productId,
      product_slug: p.productSlug,
      category: p.category,
      store: p.store,
      traffic,
      utm_source: utm.utm_source ?? undefined,
      utm_medium: utm.utm_medium ?? undefined,
      utm_campaign: utm.utm_campaign ?? undefined,
      ttclid: utm.ttclid ?? undefined,
      value: isFinitePositive(p.price) ? p.price : undefined,
    })
  } catch {
    // no-op
  }

  // 2) Intent (server) — best-effort
  try {
    const url = "/api/intent"
    const payload = buildIntentPayload(p)
    const body = JSON.stringify(payload)

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: "application/json" }))
      if (ok) return
    }

    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {})
  } catch {
    // no-op
  }
}

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
}

function isFbIgInAppUA(ua: string) {
  const s = (ua || "").toLowerCase()
  return s.includes("fbav") || s.includes("fb_iab") || s.includes("instagram")
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

  const looksFbIg =
    utmSource === "fb" ||
    utmSource === "facebook" ||
    utmSource === "ig" ||
    utmSource === "instagram"

  const hasClickId = Boolean(utm.fbclid || utm.gclid || utm.ttclid)

  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : ""
  const uaInApp = isFbIgInAppUA(ua)

  if (looksPaid || looksFbIg || hasClickId || uaInApp) return "ads"
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
    const hasAny =
      ctx.traffic === "ads" ||
      Object.values(ctx.utm).some((v) => typeof v === "string" && v && v.length > 0)

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

function resolveTrafficAndUtm(): { traffic: Traffic; utm: UTMFields } {
  const utmNow = readUtmFromLocation()
  const trafficNow = detectTrafficFromSignals(utmNow)

  const hasSignalsNow =
    trafficNow === "ads" ||
    Object.values(utmNow).some((v) => typeof v === "string" && v && v.length > 0)

  if (hasSignalsNow) {
    const ctx: TrafficCtx = {
      traffic: trafficNow,
      utm: utmNow,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24h
    }
    persistTrafficCtxIfUseful(ctx)
    return { traffic: trafficNow, utm: utmNow }
  }

  const ctx = readTrafficCtx()
  if (ctx) return { traffic: ctx.traffic, utm: ctx.utm }

  return { traffic: "organic", utm: utmNow }
}

/**
 * ✅ NOVO: chame isso em páginas de entrada (BridgePage/ProductPage)
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

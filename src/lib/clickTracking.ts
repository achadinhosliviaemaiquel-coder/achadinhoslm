type Store = "shopee" | "mercadolivre" | "amazon"

export type TrackBuyClickParams = {
  productId: string
  productSlug?: string
  category?: string
  store: Store
  price?: number // decimal (ex: 49.99)
  priceCents?: number // inteiro (ex: 4999) — preferencial
  outboundUrl?: string
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

function buildIntentUrl(p: TrackBuyClickParams) {
  const qs = new URLSearchParams()

  qs.set("product_id", p.productId)
  qs.set("store", p.store)

  if (p.productSlug) qs.set("product_slug", p.productSlug)
  if (p.category) qs.set("category", p.category)

  // ✅ Prioriza cents (evita bug "39.90" virar "399")
  const cents =
    isFinitePositive(p.priceCents) ? Math.trunc(p.priceCents) : toPriceCentsFromDecimal(p.price) ?? null

  if (cents !== null && cents > 0) {
    qs.set("price_cents", String(cents))
    qs.set("price", (cents / 100).toFixed(2))
  } else if (isFinitePositive(p.price)) {
    qs.set("price", p.price.toFixed(2))
  }

  // (opcional) outboundUrl se você quiser logar depois
  // se seu intent.ts não usa isso, pode deixar comentado
  // if (p.outboundUrl) qs.set("outbound_url", p.outboundUrl)

  return `${window.location.origin}/api/intent?${qs.toString()}`
}

/**
 * ✅ TRACK ONLY:
 * - GA4 + /api/intent
 * - NÃO abre aba
 * - NÃO redireciona
 *
 * A navegação deve acontecer 1x no StoreButton (via href /api/go)
 */
export function trackBuyClick(p: TrackBuyClickParams) {
  // 1) GA4 (intenção)
  try {
    window.gtag?.("event", "affiliate_click", {
      product_id: p.productId,
      product_slug: p.productSlug,
      category: p.category,
      store: p.store,
      // ✅ value deve ser decimal (GA)
      value: isFinitePositive(p.price) ? p.price : undefined,
    })
  } catch {
    // no-op
  }

  // 2) Intent via beacon/keepalive (dev + prod)
  try {
    const intentUrl = buildIntentUrl(p)

    // ✅ sendBeacon envia um body; como estamos usando GET, prefira fetch keepalive.
    // Ainda assim, se quiser manter sendBeacon, mande POST (mais correto).
    fetch(intentUrl, { method: "GET", keepalive: true }).catch(() => {})
  } catch {
    // no-op
  }
}

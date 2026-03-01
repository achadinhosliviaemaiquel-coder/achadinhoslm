import { useEffect, useMemo, useState } from "react"
import { useParams, useNavigate, useLocation, Link } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useProduct } from "@/hooks/useProducts"
import { trackProductView } from "@/lib/analytics"
import { CATEGORY_LABELS } from "@/types/product"
import { ChevronLeft, Check, AlertCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { useProductMetrics } from "@/hooks/useProductMetrics"
import { StoreButton } from "@/components/StoreButton"
import { Helmet } from "react-helmet-async"
import { seedTrafficCtxFromUrl } from "@/lib/clickTracking"

// ----------------- price helpers -----------------
function parsePrice(label: string) {
  const raw = (label || "").trim()
  if (!raw) return NaN

  const cleaned = raw.replace(/[^\d.,]/g, "")
  if (!cleaned) return NaN

  const hasDot = cleaned.includes(".")
  const hasComma = cleaned.includes(",")

  if (hasDot && hasComma) {
    const n = Number(cleaned.replace(/\./g, "").replace(",", "."))
    return Number.isFinite(n) ? n : NaN
  }

  if (hasComma && !hasDot) {
    const n = Number(cleaned.replace(",", "."))
    return Number.isFinite(n) ? n : NaN
  }

  if (hasDot && !hasComma) {
    if (/\.\d{2}$/.test(cleaned)) {
      const n = Number(cleaned)
      return Number.isFinite(n) ? n : NaN
    }
    const n = Number(cleaned.replace(/\./g, ""))
    return Number.isFinite(n) ? n : NaN
  }

  const n = Number(cleaned)
  return Number.isFinite(n) ? n : NaN
}

function toPriceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v === "string") {
    const n = parsePrice(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function getReviewStyles(url: string) {
  if (url.includes("youtube")) return "w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
  if (url.includes("instagram"))
    return "w-full bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white font-semibold"
  return "w-full border border-primary text-primary hover:bg-primary/10"
}

type Offer = {
  store: "shopee" | "mercadolivre" | "amazon"
  label: string
  url: string
  priority: number
}

function isSafeHttpUrl(raw: string) {
  try {
    const u = new URL(raw)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function unwrapNestedGoUrl(raw: string) {
  let current = (raw || "").trim()

  for (let i = 0; i < 2; i++) {
    if (!current) break

    const isGo =
      current.startsWith("/api/go") ||
      (() => {
        try {
          const u = new URL(current)
          return u.pathname === "/api/go"
        } catch {
          return false
        }
      })()

    if (!isGo) break

    try {
      const u = new URL(current, window.location.origin)
      const inner = u.searchParams.get("url")
      current = inner ? decodeURIComponent(inner) : ""
      continue
    } catch {
      current = ""
      break
    }
  }

  return current
}

function getOrCreateSessionId() {
  const sessionKey = "sid"
  let sid = sessionStorage.getItem(sessionKey)

  if (!sid) {
    sid =
      globalThis.crypto && "randomUUID" in globalThis.crypto
        ? (globalThis.crypto as Crypto).randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
    sessionStorage.setItem(sessionKey, sid)
  }

  return sid
}

function pickBestManualOffer(product: any): { store: Offer["store"]; price: number; url: string } | null {
  if (!product) return null

  const candidates: Array<{ store: Offer["store"]; price: number; url: string; priority: number }> = []

  const shopeePrice = toPriceNumber(product?.shopee_price)
  const mlPrice = toPriceNumber(product?.mercadolivre_price)
  const amzPrice = toPriceNumber(product?.amazon_price)

  if (product?.amazon_link && amzPrice && amzPrice > 0)
    candidates.push({ store: "amazon", price: amzPrice, url: product.amazon_link, priority: 0 })
  if (product?.mercadolivre_link && mlPrice && mlPrice > 0)
    candidates.push({ store: "mercadolivre", price: mlPrice, url: product.mercadolivre_link, priority: 1 })
  if (product?.shopee_link && shopeePrice && shopeePrice > 0)
    candidates.push({ store: "shopee", price: shopeePrice, url: product.shopee_link, priority: 2 })

  if (candidates.length === 0) return null

  candidates.sort((a, b) => a.price - b.price || a.priority - b.priority)
  const best = candidates[0]
  return { store: best.store, price: best.price, url: best.url }
}

function toAbsUrl(pathOrUrl: string) {
  const v = (pathOrUrl || "").trim()
  if (!v) return ""
  if (/^https?:\/\//i.test(v)) return v
  return `https://achadinhoslm.com.br${v.startsWith("/") ? "" : "/"}${v}`
}

function isInAppBrowser() {
  if (typeof navigator === "undefined") return false
  const ua = navigator.userAgent || ""
  return /FBAN|FBAV|Instagram|Line|TikTok|BytedanceWebview|Pinterest|Snapchat|WhatsApp/i.test(ua)
}

function isMobileLike() {
  if (typeof navigator === "undefined") return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function shouldOpenBlankDesktop() {
  if (typeof navigator === "undefined") return false
  if (isMobileLike()) return false
  if (isInAppBrowser()) return false
  return true
}

/**
 * ✅ Copia utm_* + clids (fbclid/gclid/ttclid) da URL atual para o /api/go
 * Isso é o que vai te permitir diferenciar TikTok/FB/IG mesmo quando o Referer não vem completo.
 */
function appendTrackingParams(target: URL, locationSearch: string) {
  try {
    const sp = new URLSearchParams(locationSearch)

    const keys = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ttclid",
    ]

    for (const k of keys) {
      const v = sp.get(k)
      if (v) target.searchParams.set(k, v)
    }
  } catch {
    // ignore
  }
}

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    seedTrafficCtxFromUrl()
  }, [location.search])

  const { data: product, isLoading, error } = useProduct(slug || "")
  const [showOtherStores, setShowOtherStores] = useState(false)

  const metricsQuery = useProductMetrics(product?.id)
  const hasReview = !!product?.review_url

  const bestOffer = useMemo(() => {
    if (!product) return null
    return pickBestManualOffer(product)
  }, [product])

  const secondaryOffers = useMemo<Offer[]>(() => {
    if (!product) return []
    const list: Offer[] = []
    if (product.amazon_link) list.push({ store: "amazon", label: "Comprar agora na Amazon", url: product.amazon_link, priority: 0 })
    if (product.mercadolivre_link)
      list.push({ store: "mercadolivre", label: "Comprar agora no Mercado Livre", url: product.mercadolivre_link, priority: 1 })
    if (product.shopee_link) list.push({ store: "shopee", label: "Comprar agora na Shopee", url: product.shopee_link, priority: 2 })

    const primaryStore = bestOffer?.store
    const filtered = primaryStore ? list.filter((o) => o.store !== primaryStore) : list
    return filtered.sort((a, b) => a.priority - b.priority)
  }, [product, bestOffer?.store])

  const hasAnyOffers = !!bestOffer || secondaryOffers.length > 0

  const views7d = metricsQuery.data?.views7d ?? 0
  const efficiency7d = metricsQuery.data?.efficiency7d ?? 0
  const showTrending = !!product?.id && views7d >= 200 && efficiency7d >= 5

  const finalPrice = useMemo(() => {
    if (!product) return NaN
    const bestPrice = typeof bestOffer?.price === "number" ? bestOffer.price : null
    const manualLabelPrice = parsePrice(product.price_label)
    return bestPrice ?? (Number.isFinite(manualLabelPrice) ? manualLabelPrice : NaN)
  }, [product, bestOffer?.price])

  const urgencyText = useMemo(() => {
    if (!product) return ""
    const urgencyFromData = (product.urgency_label || "").trim()
    const computedUrgency = !urgencyFromData && showTrending ? "Alta demanda hoje" : ""
    return urgencyFromData || computedUrgency
  }, [product, showTrending])

  const shouldShowSignalsCard = Boolean(showTrending || hasReview || urgencyText)

  const handleBack = () => {
    if ((location.state as any)?.from) navigate((location.state as any).from)
    else navigate(-1)
  }

  /**
   * ✅ NOVO: /api/go por SLUG (server resolve offer)
   * - mantém store explícito (pra escolher a plataforma)
   * - passa session_id
   * - passa UTMs/clids atuais (inclui ttclid)
   */
  const buildGoUrl = (offer: Offer) => {
    if (!product) return "#"

    // sanity (não usamos offer.url aqui, mas ainda dá pra evitar CTA sem link)
    const finalUrl = unwrapNestedGoUrl(offer.url) || offer.url
    if (offer.url && !finalUrl) return "#"
    if (finalUrl && !finalUrl.startsWith("/api/go") && !isSafeHttpUrl(finalUrl)) {
      console.error("[buildGoUrl] URL inválida cadastrada no produto:", { offerUrl: offer.url, finalUrl })
      return "#"
    }

    const sid = getOrCreateSessionId()

    const go = new URL("/api/go", window.location.origin)
    go.searchParams.set("store", offer.store)
    go.searchParams.set("slug", product.slug)
    go.searchParams.set("session_id", sid)

    // ✅ repassa UTMs / clids (fbclid/gclid/ttclid) da URL atual
    appendTrackingParams(go, location.search)

    return `${go.pathname}?${go.searchParams.toString()}`
  }

  const primaryGoHref = useMemo(() => {
    if (!product || !bestOffer) return ""

    const sid = getOrCreateSessionId()
    const go = new URL("/api/go", window.location.origin)
    go.searchParams.set("store", bestOffer.store)
    go.searchParams.set("slug", product.slug)
    go.searchParams.set("session_id", sid)

    appendTrackingParams(go, location.search)

    return `${go.pathname}?${go.searchParams.toString()}`
  }, [product, bestOffer, location.search])

  const productSchema = useMemo(() => {
    if (!product) return null

    const price = Number.isFinite(finalPrice) ? Number(finalPrice.toFixed(2)) : null
    const offer =
      price != null
        ? {
            "@type": "Offer",
            priceCurrency: "BRL",
            price,
            availability: "https://schema.org/InStock",
            url: `https://achadinhoslm.com.br/product/${product.slug}`,
          }
        : undefined

    const img0 = product.image_urls?.[0] ? toAbsUrl(product.image_urls[0]) : ""

    return {
      "@context": "https://schema.org",
      "@type": "Product",
      name: product.name,
      description: product.description || product.name,
      sku: product.id,
      url: `https://achadinhoslm.com.br/product/${product.slug}`,
      image: img0 ? [img0] : undefined,
      category: CATEGORY_LABELS[product.category] || product.category,
      brand: (product as any)?.brand ? { "@type": "Brand", name: (product as any).brand } : undefined,
      offers: offer,
    }
  }, [product, finalPrice])

  useEffect(() => {
    if (!product?.id) return

    const sid = getOrCreateSessionId()

    const throttleKey = `view:throttle:${product.id}`
    const last = Number(sessionStorage.getItem(throttleKey) || "0")
    const now = Date.now()
    if (Number.isFinite(last) && now - last < 10_000) return
    sessionStorage.setItem(throttleKey, String(now))

    void fetch(`/api/view?product_id=${encodeURIComponent(product.id)}&session_id=${encodeURIComponent(sid)}`, {
      method: "GET",
      keepalive: true,
    })
  }, [product?.id])

  useEffect(() => {
    if (product) trackProductView(product.slug, product.category)
  }, [product])

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Layout>
    )
  }

  if (error || !product) {
    return (
      <Layout
        seo={{
          title: "Produto não encontrado | Achadinhos LM",
          description: "Produto não encontrado.",
          canonical: `/product/${slug || ""}`,
          ogImage: "/og-home.jpg",
          ogType: "website",
          noindex: true,
        }}
      >
        <div className="text-center py-16 space-y-4">
          <span className="text-4xl">😢</span>
          <h1 className="text-xl font-semibold">Produto não encontrado</h1>
          <Button asChild>
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </Layout>
    )
  }

  const desktopBlank = shouldOpenBlankDesktop()

  return (
    <Layout
      breadcrumb={[
        { name: "Home", url: "/" },
        { name: CATEGORY_LABELS[product.category], url: `/category/${product.category}` },
        ...(product.subcategory
          ? [{ name: product.subcategory, url: `/category/${product.category}?sub=${product.subcategory}` }]
          : []),
        { name: product.name, url: `/product/${product.slug}` },
      ]}
      seo={{
        title: `${product.name}${Number.isFinite(finalPrice) ? ` | a partir de R$\u00a0${finalPrice.toFixed(2).replace(".", ",")}` : ""} | Achadinhos LM`,
        description: (product.description || `Confira onde comprar ${product.name} com o menor preço.`).slice(0, 160),
        canonical: `/product/${product.slug}`,
        ogImage: product.image_urls?.[0] || "/og-home.jpg",
        ogType: "product",
      }}
    >
      {productSchema ? (
        <Helmet>
          <script type="application/ld+json">{JSON.stringify(productSchema)}</script>
          {Number.isFinite(finalPrice) ? (
            <meta property="og:product:price:amount" content={finalPrice.toFixed(2)} />
          ) : null}
          {Number.isFinite(finalPrice) ? (
            <meta property="product:price:currency" content="BRL" />
          ) : null}
        </Helmet>
      ) : null}

      <div className="animate-fade-in mx-auto max-w-6xl">
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          <section className="lg:col-span-7">
            <div className="lg:sticky lg:top-24">
              <div className="relative rounded-2xl overflow-hidden bg-muted shadow-sm border border-black/10">
                <img
                  src={product.image_urls?.[0] || "/placeholder.svg"}
                  alt={product.name}
                  className="w-full max-h-[520px] object-contain bg-muted"
                  loading="eager"
                />
                {urgencyText && (
                  <span className="absolute top-3 left-3 bg-amber-300 text-black text-[11px] font-semibold px-3 py-1 rounded-md">
                    {urgencyText}
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="lg:col-span-5">
            <div className="space-y-4">
              <Link to={`/category/${product.category}`}>
                <Badge className="bg-muted text-muted-foreground text-[11px]">
                  {CATEGORY_LABELS[product.category]}
                  {product.subcategory && ` › ${product.subcategory}`}
                </Badge>
              </Link>

              <h1 className="text-xl lg:text-2xl font-semibold leading-tight">{product.name}</h1>

              <div className="flex items-end gap-3">
                <span className="text-2xl font-bold text-emerald-700">
                  {Number.isFinite(finalPrice) ? formatCurrency(finalPrice) : "Consulte o preço"}
                </span>

                <span className="text-xs text-muted-foreground">
                  {bestOffer ? "preço cadastrado (pode variar)" : "preço pode variar"}
                </span>
              </div>

              {!shouldShowSignalsCard && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Redirecionamento seguro para a loja oficial. Preço e estoque podem variar.
                </p>
              )}

              {shouldShowSignalsCard && (
                <div className="rounded-2xl border border-black/10 p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm">Sinais do produto</div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {metricsQuery.isLoading ? (
                      <span className="text-xs text-muted-foreground">Carregando…</span>
                    ) : (
                      <>
                        {showTrending && <Badge className="bg-amber-200 text-black hover:bg-amber-200">🔥 Em alta</Badge>}
                        {hasReview && (
                          <Badge variant="outline" className="gap-1">
                            ✅ Review disponível
                          </Badge>
                        )}
                        {urgencyText && <Badge className="bg-amber-200 text-black hover:bg-amber-200">⏳ {urgencyText}</Badge>}
                      </>
                    )}
                  </div>

                  <div className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    Você será redirecionado para a loja oficial. Preço e estoque podem variar.
                  </div>
                </div>
              )}

              {hasAnyOffers && (
                <div className="space-y-3">
                  {bestOffer ? (
                    <StoreButton
                      store={bestOffer.store}
                      productId={product.id}
                      productSlug={product.slug}
                      category={product.category}
                      price={Number.isFinite(finalPrice) ? finalPrice : undefined}
                      href={primaryGoHref}
                      target={desktopBlank ? "_blank" : "_self"}
                      disabled={primaryGoHref === "#" || !primaryGoHref}
                      isPrimary
                      showExternalIcon={desktopBlank}
                    />
                  ) : null}

                  {secondaryOffers.length > 0 && (
                    <div className="rounded-2xl border border-black/10 p-4">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between text-sm font-medium"
                        onClick={() => setShowOtherStores((v) => !v)}
                      >
                        <span>Outras lojas</span>
                        <span className="text-xs text-muted-foreground">
                          {showOtherStores ? "Ocultar" : `Ver ${secondaryOffers.length}`}
                        </span>
                      </button>

                      {showOtherStores && (
                        <div className="mt-3 space-y-2">
                          {secondaryOffers.map((o) => {
                            const href = buildGoUrl(o)
                            return (
                              <StoreButton
                                key={o.store}
                                store={o.store}
                                productId={product.id}
                                productSlug={product.slug}
                                category={product.category}
                                price={Number.isFinite(finalPrice) ? finalPrice : undefined}
                                href={href}
                                target={desktopBlank ? "_blank" : "_self"}
                                className="min-h-[48px] rounded-2xl text-sm"
                                disabled={href === "#" || !href}
                                showExternalIcon={desktopBlank}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {product.review_url && (
                <Button asChild className={getReviewStyles(product.review_url)}>
                  <a href={product.review_url} target="_blank" rel="noopener noreferrer">
                    🎥 Ver Review do Produto
                  </a>
                </Button>
              )}

              {product.description && <p className="text-muted-foreground leading-relaxed text-sm">{product.description}</p>}

              {product.benefits?.length > 0 && (
                <div className="space-y-2">
                  <h2 className="font-semibold text-sm">Benefícios</h2>
                  <ul className="space-y-2">
                    {product.benefits.map((benefit: string, index: number) => (
                      <li key={index} className="flex items-start gap-2 text-muted-foreground text-sm">
                        <Check className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                        <span>{benefit}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="bg-muted rounded-xl p-4 flex gap-3 items-start">
                <AlertCircle className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Este link é de afiliado. Ao comprar através dele, você nos ajuda a continuar trazendo ofertas incríveis,
                  sem custo adicional.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}

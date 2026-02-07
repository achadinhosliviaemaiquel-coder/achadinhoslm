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
import { Helmet } from "react-helmet-async"
import { useProductMetrics } from "@/hooks/useProductMetrics"
import { StoreButton } from "@/components/StoreButton"
import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

function parsePrice(label: string) {
  const value = (label || "").replace(/[^\d,]/g, "").replace(",", ".")
  const n = parseFloat(value)
  return Number.isFinite(n) ? n : NaN
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

// ---- helpers para evitar double-wrap /api/go ----
function isSafeHttpUrl(raw: string) {
  try {
    const u = new URL(raw)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * Se receber algo como:
 *  - /api/go?url=https%3A%2F%2Famzn.to%2Fxxx&...
 *  - https://seusite.vercel.app/api/go?url=https%3A...
 * devolve a URL externa (https://...).
 * Tenta no máximo 2 "unwraps" para evitar loop.
 */
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

type BestOfferRow = {
  product_id: string
  offer_id: number
  platform: "mercadolivre" | "shopee" | "amazon"
  url: string
  external_id: string
  priority_boost: number
  price: number | null
  currency: string | null
  is_available: boolean
  verified_at: string
  verified_date: string
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

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const { data: product, isLoading, error } = useProduct(slug || "")
  const [showOtherStores, setShowOtherStores] = useState(false)

  // ✅ Hook sempre chamado
  const metricsQuery = useProductMetrics(product?.id)

  // ✅ Regras “Em alta”
  const views7d = metricsQuery.data?.views7d ?? 0
  const efficiency7d = metricsQuery.data?.efficiency7d ?? 0
  const showTrending = !!product?.id && views7d >= 200 && efficiency7d >= 5

  const hasReview = !!product?.review_url

  // ✅ Best offer (preço verificado + CTA primário automático)
  const bestOfferQuery = useQuery({
    queryKey: ["best-offer", product?.id],
    enabled: !!product?.id,
    queryFn: async (): Promise<BestOfferRow | null> => {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from("v_product_best_offer")
        .select(
          "product_id, offer_id, platform, url, external_id, priority_boost, price, currency, is_available, verified_at, verified_date"
        )
        .eq("product_id", product!.id)
        .maybeSingle()

      if (error) throw error
      return (data as BestOfferRow | null) ?? null
    },
  })

  const bestOffer = bestOfferQuery.data ?? null

  // ✅ Ofertas secundárias (mantém compatibilidade com os links atuais do product)
  // - Primário: bestOffer (se existir)
  // - Secundários: product.*_link (excluindo a loja primária se coincidir)
  const secondaryOffers = useMemo<Offer[]>(() => {
    if (!product) return []
    const list: Offer[] = []
    if (product.amazon_link) list.push({ store: "amazon", label: "Comprar agora na Amazon", url: product.amazon_link, priority: 0 })
    if (product.mercadolivre_link)
      list.push({ store: "mercadolivre", label: "Comprar agora no Mercado Livre", url: product.mercadolivre_link, priority: 1 })
    if (product.shopee_link) list.push({ store: "shopee", label: "Comprar agora na Shopee", url: product.shopee_link, priority: 2 })

    const primaryStore = bestOffer?.platform
    const filtered = primaryStore ? list.filter((o) => o.store !== primaryStore) : list

    return filtered.sort((a, b) => a.priority - b.priority)
  }, [product, bestOffer?.platform])

  const hasAnyOffers = !!bestOffer || secondaryOffers.length > 0

  const handleBack = () => {
    if (location.state?.from) navigate(location.state.from)
    else navigate(-1)
  }

  const isMobileLike = () => {
    if (typeof navigator === "undefined") return false
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  }

  // ✅ Mantém o builder legado para ofertas secundárias (url-based)
  const buildGoUrl = (offer: Offer) => {
    if (!product) return "#"

    const finalUrl = unwrapNestedGoUrl(offer.url) || offer.url

    if (!isSafeHttpUrl(finalUrl)) {
      console.error("[buildGoUrl] URL inválida para outbound:", { offerUrl: offer.url, finalUrl })
      return "#"
    }

    const sid = getOrCreateSessionId()
    const params = new URLSearchParams({
      url: finalUrl,
      product_id: product.id,
      store: offer.store,
      session_id: sid,
    })

    return `/api/go?${params.toString()}`
  }

  /**
   * TRACKING VIEW (server-side)
   * - Gera session_id estável por sessão
   * - Não faz dedupe “definitivo” no client (isso fica no backend)
   * - Throttle curto (10s) só pra evitar spam acidental em dev/hot reload
   */
  useEffect(() => {
    if (!product?.id) return

    const sid = getOrCreateSessionId()

    // throttle curto por produto (não é dedupe): evita múltiplos hits em poucos segundos
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

  // (Opcional) tracking “client analytics” separado (GA/etc)
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
      <Layout>
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

  // ✅ Preço: prioriza o verificado (bestOffer.price), fallback para label manual
  const manualPrice = parsePrice(product.price_label)
  const finalPrice = bestOffer?.price ?? (Number.isFinite(manualPrice) ? manualPrice : NaN)

  const today = new Date().toISOString().slice(0, 10)
  const verifiedToday = bestOffer?.verified_date === today

  /**
   * ✅ URGÊNCIA: só quando existe motivo.
   * - 1) prioridade: urgency_label (admin)
   * - 2) fallback automático: quando “Em alta”
   */
  const urgencyFromData = (product.urgency_label || "").trim()
  const computedUrgency = !urgencyFromData && showTrending ? "Alta demanda hoje" : ""
  const urgencyText = urgencyFromData || computedUrgency

  /**
   * ✅ “Sinais do produto” só aparece se existir sinal real
   */
  const shouldShowSignalsCard = Boolean(showTrending || hasReview || urgencyText)

  // ✅ CTA primário: passa session_id também (para fechar funil)
  const primaryGoHref = bestOffer
    ? (() => {
        const sid = getOrCreateSessionId()
        const params = new URLSearchParams({
          offer_id: String(bestOffer.offer_id),
          session_id: sid,
        })
        return `/api/go?${params.toString()}`
      })()
    : ""

  return (
    <Layout
      breadcrumb={[
        { name: "Home", url: "/" },
        { name: CATEGORY_LABELS[product.category], url: `/category/${product.category}` },
        ...(product.subcategory ? [{ name: product.subcategory, url: `/category/${product.category}?sub=${product.subcategory}` }] : []),
        { name: product.name, url: `/product/${product.slug}` },
      ]}
    >
      <Helmet>
        <title>{product.name} | Menor preço e onde comprar</title>
        <meta name="description" content={product.description || product.name} />
      </Helmet>

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
                  {bestOffer ? (verifiedToday ? "preço verificado hoje" : `preço verificado em ${bestOffer.verified_date}`) : "preço pode variar"}
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
                  {/* ✅ CTA primário: bestOffer (verificado) → /api/go?offer_id=...&session_id=... */}
                  {bestOffer ? (
                    <StoreButton
                      store={bestOffer.platform}
                      productId={product.id}
                      productSlug={product.slug}
                      category={product.category}
                      price={Number.isFinite(finalPrice) ? finalPrice : undefined}
                      href={primaryGoHref}
                      target={isMobileLike() ? "_self" : "_blank"}
                    />
                  ) : null}

                  {/* ✅ Secundários: links legados do produto (se existirem) */}
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
                                target={href === "#" ? "_self" : isMobileLike() ? "_self" : "_blank"}
                                className="min-h-[48px] rounded-2xl text-sm"
                                disabled={href === "#"}
                              />
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* feedback leve enquanto bestOffer carrega */}
                  {bestOfferQuery.isLoading && (
                    <p className="text-xs text-muted-foreground leading-relaxed">Verificando preço e disponibilidade…</p>
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
                  Este link é de afiliado. Ao comprar através dele, você nos ajuda a continuar trazendo ofertas incríveis, sem custo adicional.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}

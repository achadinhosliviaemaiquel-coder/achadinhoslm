import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProduct } from '@/hooks/useProducts'
import { trackProductView } from '@/lib/analytics'
import { CATEGORY_LABELS } from '@/types/product'
import { ChevronLeft, Check, AlertCircle } from 'lucide-react'
import { getSupabase } from "@/integrations/supabase/client"
import { getLowestPrice, formatCurrency } from '@/lib/utils'
import { Helmet } from 'react-helmet-async'
import { useProductClicks } from '@/hooks/useProductClicks'
import { trackBuyClick } from '@/lib/clickTracking'

function parsePrice(label: string) {
  const value = label.replace(/[^\d,]/g, "").replace(",", ".")
  return parseFloat(value)
}

function getReviewStyles(url: string) {
  if (url.includes('youtube')) return "w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
  if (url.includes('instagram')) return "w-full bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white font-semibold"
  return "w-full border border-primary text-primary hover:bg-primary/10"
}

type Offer = {
  store: "shopee" | "mercadolivre" | "amazon"
  label: string
  url: string
  priority: number
}

export default function ProductPage() {
  // ✅ Hooks sempre no topo
  const supabase = getSupabase()
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const { data: product, isLoading, error } = useProduct(slug || '')
  const [showOtherStores, setShowOtherStores] = useState(false)

  // ✅ Hook sempre chamado (ele mesmo controla enabled internamente)
  const clicksQuery = useProductClicks(product?.id)

  // ✅ useMemo sempre chamado (mesmo sem product)
  const offers = useMemo<Offer[]>(() => {
    if (!product) return []
    const list: Offer[] = []
    if (product.amazon_link) list.push({ store: "amazon", label: "Comprar agora na Amazon", url: product.amazon_link, priority: 0 })
    if (product.mercadolivre_link) list.push({ store: "mercadolivre", label: "Comprar agora no Mercado Livre", url: product.mercadolivre_link, priority: 1 })
    if (product.shopee_link) list.push({ store: "shopee", label: "Comprar agora na Shopee", url: product.shopee_link, priority: 2 })
    return list.sort((a, b) => a.priority - b.priority)
  }, [product])

  const primaryOffer = offers[0]
  const secondaryOffers = offers.slice(1)
  const hasStoreLinks = offers.length > 0

  const handleBack = () => {
    if (location.state?.from) navigate(location.state.from)
    else navigate(-1)
  }

  useEffect(() => {
    if (!product?.id) return
    supabase.rpc('increment_product_views', { product_id: product.id })
  }, [product?.id, supabase])

  useEffect(() => {
    if (product) trackProductView(product.slug, product.category)
  }, [product])

  // ✅ Agora sim: returns condicionais abaixo de todos os hooks
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

  const lowestPrice = getLowestPrice(product)
  const manualPrice = parsePrice(product.price_label)
  const finalPrice =
    lowestPrice && !isNaN(manualPrice)
      ? Math.min(lowestPrice, manualPrice)
      : manualPrice

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
                  src={product.image_urls?.[0] || '/placeholder.svg'}
                  alt={product.name}
                  className="w-full max-h-[520px] object-contain bg-muted"
                  loading="eager"
                />
                {product.urgency_label && (
                  <span className="absolute top-3 left-3 bg-amber-300 text-black text-[11px] font-semibold px-3 py-1 rounded-md">
                    {product.urgency_label}
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

              <h1 className="text-xl lg:text-2xl font-semibold leading-tight">
                {product.name}
              </h1>

              <div className="flex items-end gap-3">
                <span className="text-2xl font-bold text-emerald-700">
                  {formatCurrency(finalPrice)}
                </span>
                <span className="text-xs text-muted-foreground">
                  preço verificado • pode mudar
                </span>
              </div>

              <div className="rounded-2xl border border-black/10 p-4 text-sm">
                <div className="font-semibold">Interesse real</div>
                <div className="text-muted-foreground mt-1">
                  {(clicksQuery.data?.clicks24h ?? 0)} pessoas clicaram para comprar nas últimas 24h •{" "}
                  {(clicksQuery.data?.clicks7d ?? 0)} nos últimos 7 dias
                </div>
              </div>

              {hasStoreLinks && primaryOffer && (
                <div className="space-y-3">
                  <Button
                    className="w-full h-12 rounded-2xl text-base font-semibold"
                    onClick={() =>
                      trackBuyClick({
                        productId: product.id,
                        productSlug: product.slug,
                        category: product.category,
                        store: primaryOffer.store,
                        price: finalPrice,
                        outboundUrl: primaryOffer.url,
                        redirectMode: "server_go",
                      })
                    }
                  >
                    {primaryOffer.label}
                  </Button>

                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Você será redirecionado para a loja oficial. Preço e estoque podem variar.
                  </div>

                  {secondaryOffers.length > 0 && (
                    <div className="rounded-2xl border border-black/10 p-4">
                      <button
                        type="button"
                        className="w-full flex items-center justify-between text-sm font-medium"
                        onClick={() => setShowOtherStores(v => !v)}
                      >
                        <span>Outras lojas</span>
                        <span className="text-xs text-muted-foreground">
                          {showOtherStores ? "Ocultar" : `Ver ${secondaryOffers.length}`}
                        </span>
                      </button>

                      {showOtherStores && (
                        <div className="mt-3 space-y-2">
                          {secondaryOffers.map((o) => (
                            <Button
                              key={o.store}
                              variant="outline"
                              className="w-full rounded-2xl justify-between"
                              onClick={() =>
                                trackBuyClick({
                                  productId: product.id,
                                  productSlug: product.slug,
                                  category: product.category,
                                  store: o.store,
                                  price: finalPrice,
                                  outboundUrl: o.url,
                                  redirectMode: "server_go",
                                })
                              }
                            >
                              <span>{o.store === "mercadolivre" ? "Mercado Livre" : o.store === "amazon" ? "Amazon" : "Shopee"}</span>
                              <span className="text-xs text-muted-foreground">Ver oferta</span>
                            </Button>
                          ))}
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

              {product.description && (
                <p className="text-muted-foreground leading-relaxed text-sm">
                  {product.description}
                </p>
              )}

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
                  Este link é de afiliado. Ao comprar através dele, você nos ajuda a continuar
                  trazendo ofertas incríveis, sem custo adicional.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </Layout>
  )
}

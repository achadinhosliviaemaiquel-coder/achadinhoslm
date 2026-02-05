import { useEffect } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { StoreButton } from '@/components/StoreButton'
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

function parsePrice(label: string) {
  const value = label.replace(/[^\d,]/g, "").replace(",", ".")
  return parseFloat(value)
}

function getReviewStyles(url: string) {
  if (url.includes('youtube')) {
    return "w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
  }
  if (url.includes('instagram')) {
    return "w-full bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500 text-white font-semibold"
  }
  return "w-full border border-primary text-primary hover:bg-primary/10"
}

export default function ProductPage() {
  const supabase = getSupabase() // ✅ CORREÇÃO AQUI

  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: product, isLoading, error } = useProduct(slug || '')

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

  const hasStoreLinks =
    product.shopee_link || product.mercadolivre_link || product.amazon_link

  return (
    <Layout
      breadcrumb={[
        { name: "Home", url: "/" },
        { name: CATEGORY_LABELS[product.category], url: `/category/${product.category}` },
        ...(product.subcategory
          ? [{ name: product.subcategory, url: `/category/${product.category}?sub=${product.subcategory}` }]
          : []),
        { name: product.name, url: `/produto/${product.slug}` },
      ]}
    >
      <Helmet>
        <title>{product.name} | Menor preço e onde comprar</title>
        <meta name="description" content={product.description || product.name} />
      </Helmet>
      
      <div className="space-y-6 animate-fade-in max-w-[820px] mx-auto">

        <Button variant="ghost" size="sm" onClick={handleBack} className="-ml-2">
          <ChevronLeft className="h-4 w-4 mr-1" />
          Voltar
        </Button>

        <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted shadow-sm">
          <img
            src={product.image_urls?.[0] || '/placeholder.svg'}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {product.urgency_label && (
            <span className="absolute top-3 left-3 bg-amber-300 text-black text-[11px] font-semibold px-3 py-1 rounded-md">
              {product.urgency_label}
            </span>
          )}
        </div>

        <div className="space-y-3">
          <Link to={`/category/${product.category}`}>
            <Badge className="bg-muted text-muted-foreground text-[11px]">
              {CATEGORY_LABELS[product.category]}
              {product.subcategory && ` › ${product.subcategory}`}
            </Badge>
          </Link>

          <h1 className="text-xl font-semibold leading-tight">
            {product.name}
          </h1>

          <div className="flex items-end gap-3">
            <span className="text-2xl font-bold text-emerald-700">
              {formatCurrency(finalPrice)}
            </span>
          </div>
        </div>

        {hasStoreLinks && (
          <div className="space-y-2">
            {product.shopee_link && (
              <StoreButton
                store="shopee"
                productSlug={product.slug}
                price={finalPrice}
                category={product.category}
              />
            )}

            {product.mercadolivre_link && (
              <StoreButton
                store="mercadolivre"
                productSlug={product.slug}
                price={finalPrice}
                category={product.category}
              />
            )}

            {product.amazon_link && (
              <StoreButton
                store="amazon"
                productSlug={product.slug}
                price={finalPrice}
                category={product.category}
              />
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
              {product.benefits.map((benefit, index) => (
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
    </Layout>
  )
}

import { useEffect, useMemo, useRef, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { useProduct } from "@/hooks/useProducts"
import {
  detectBrowser,
  generateClickId,
  storeClickId,
  appendClickId,
  preserveUtmParams,
} from "@/lib/browser-detection"
import { trackBridgeLoaded, trackOutboundClick } from "@/lib/analytics"
import { Loader2, ExternalLink } from "lucide-react"
import { seedTrafficCtxFromUrl } from "@/lib/clickTracking"

type Store = "shopee" | "mercadolivre" | "amazon"

const STORE_LABELS: Record<Store, string> = {
  shopee: "Shopee",
  mercadolivre: "Mercado Livre",
  amazon: "Amazon",
}

const REDIRECT_DELAY = 900 // um pouco mais rápido pra reduzir drop

function getUtmFromUrl() {
  const sp = new URLSearchParams(window.location.search)
  const utm_source = sp.get("utm_source")
  const utm_medium = sp.get("utm_medium")
  const utm_campaign = sp.get("utm_campaign")
  const utm_content = sp.get("utm_content")
  const utm_term = sp.get("utm_term")
  const fbclid = sp.get("fbclid")
  const gclid = sp.get("gclid")
  const ttclid = sp.get("ttclid")

  return { utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, gclid, ttclid }
}

function detectTrafficFromUrlSignals(): "ads" | "organic" {
  const { utm_source, utm_medium, fbclid, gclid, ttclid } = getUtmFromUrl()
  const m = (utm_medium || "").toLowerCase()
  const s = (utm_source || "").toLowerCase()

  const looksPaid =
    m === "paid" || m === "cpc" || m === "ads" || m === "paid_social" || m === "social_paid"
  const looksFbIg = s === "fb" || s === "facebook" || s === "ig" || s === "instagram"
  const hasClid = Boolean(fbclid || gclid || ttclid)

  if (looksPaid || looksFbIg || hasClid) return "ads"
  return "organic"
}

export default function BridgePage() {
  const { store, slug } = useParams<{ store: string; slug: string }>()
  const { data: product, isLoading } = useProduct(slug || "")

  const [countdown, setCountdown] = useState(REDIRECT_DELAY / 1000)
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null)
  const [hasRedirected, setHasRedirected] = useState(false)

  const validStore = store as Store
  const storeLabel = STORE_LABELS[validStore] || store

  const isValidStore = useMemo(
    () => ["shopee", "mercadolivre", "amazon"].includes(validStore),
    [validStore]
  )

  const clickIdRef = useRef<string | null>(null)

  useEffect(() => {
    // ✅ planta o contexto de tráfego o mais cedo possível
    seedTrafficCtxFromUrl()

    if (!product || hasRedirected) return
    if (!isValidStore) return

    const linkKey = `${validStore}_link` as keyof typeof product
    const affiliateUrl = product[linkKey] as string | null
    if (!affiliateUrl) return

    detectBrowser()

    if (!clickIdRef.current) clickIdRef.current = generateClickId()
    const clickId = clickIdRef.current

    storeClickId(clickId, product.slug, validStore)
    trackBridgeLoaded(validStore, product.slug)

    // ✅ destino final (afiliado) com clickId + UTMs preservadas
    let finalAffiliateUrl = appendClickId(affiliateUrl, clickId)
    finalAffiliateUrl = preserveUtmParams(finalAffiliateUrl)

    // ✅ classifica traffic pelo que veio na URL do anúncio (mais confiável que referer do in-app)
    const traffic = detectTrafficFromUrlSignals()

    // ✅ outbound oficial via /api/go (server-side)
    const go = new URL("/api/go", window.location.origin)
    go.searchParams.set("product_id", product.id)
    go.searchParams.set("store", validStore)

    // session_id = clickId (dedupe e funil)
    go.searchParams.set("session_id", clickId)

    // passa traffic pro server registrar corretamente
    go.searchParams.set("traffic", traffic)

    // passa a URL do afiliado
    go.searchParams.set("url", finalAffiliateUrl)

    setRedirectUrl(go.toString())

    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 0.1) {
          clearInterval(countdownInterval)
          return 0
        }
        return prev - 0.1
      })
    }, 100)

    const redirectTimeout = setTimeout(() => {
      trackOutboundClick(validStore, product.slug, clickId)
      setHasRedirected(true)
      window.location.href = go.toString()
    }, REDIRECT_DELAY)

    return () => {
      clearInterval(countdownInterval)
      clearTimeout(redirectTimeout)
    }
  }, [product, validStore, hasRedirected, isValidStore])

  const handleManualRedirect = () => {
    if (!redirectUrl || hasRedirected || !product) return

    const clickId = clickIdRef.current || generateClickId()
    clickIdRef.current = clickId
    trackOutboundClick(validStore, product.slug, clickId)

    setHasRedirected(true)
    window.location.href = redirectUrl
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <span className="text-4xl">😢</span>
          <h1 className="text-xl font-semibold text-foreground">Produto não encontrado</h1>
          <Button asChild>
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    )
  }

  if (!isValidStore) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <span className="text-4xl">🚫</span>
          <h1 className="text-xl font-semibold text-foreground">Loja inválida</h1>
          <Button asChild>
            <Link to={`/product/${product.slug}`}>Voltar ao produto</Link>
          </Button>
        </div>
      </div>
    )
  }

  const linkKey = `${validStore}_link` as keyof typeof product
  const hasLink = !!product[linkKey]

  if (!hasLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <span className="text-4xl">🚫</span>
          <h1 className="text-xl font-semibold text-foreground">Link indisponível</h1>
          <p className="text-muted-foreground">Este produto não está disponível na {storeLabel}.</p>
          <Button asChild>
            <Link to={`/product/${product.slug}`}>Ver outras opções</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center space-y-6 animate-fade-in">
        <div className="space-y-2">
          <span className="text-4xl">🛍️</span>
          <h1 className="text-lg font-semibold text-foreground">Redirecionando para {storeLabel}</h1>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card space-y-3">
          <div className="w-24 h-24 mx-auto rounded-xl overflow-hidden bg-muted">
            <img
              src={product.image_urls?.[0] || "/placeholder.svg"}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          <p className="font-medium text-foreground line-clamp-2">{product.name}</p>
          <p className="text-primary font-bold">{product.price_label}</p>
        </div>

        <div className="space-y-3">
          <div className="relative h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-primary transition-all duration-100 ease-linear"
              style={{
                width: `${((REDIRECT_DELAY / 1000 - countdown) / (REDIRECT_DELAY / 1000)) * 100}%`,
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">Aguarde... {countdown.toFixed(1)}s</p>
        </div>

        <Button onClick={handleManualRedirect} variant="outline" size="lg" className="w-full" disabled={!redirectUrl}>
          Se não redirecionar, toque aqui
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>

        <Link to={`/product/${product.slug}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
          ← Voltar ao produto
        </Link>
      </div>
    </div>
  )
}

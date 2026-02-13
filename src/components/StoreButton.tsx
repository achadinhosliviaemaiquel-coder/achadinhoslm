import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { trackBuyClick } from "@/lib/clickTracking"
import React, { useMemo } from "react"

type Store = "shopee" | "mercadolivre" | "amazon"

interface StoreButtonProps {
  store: Store
  productId: string
  productSlug: string
  price?: number
  category: string
  href: string
  className?: string
  target?: "_blank" | "_self"
  showExternalIcon?: boolean
  isPrimary?: boolean
  overrideLabel?: string
  disabled?: boolean
}

const STORE_UI: Record<
  Store,
  {
    label: string
    className: string
    short: string
  }
> = {
  amazon: {
    label: "Comprar na Amazon",
    short: "Amazon",
    className: "bg-[#FF9900] hover:bg-[#e08800] text-black",
  },
  mercadolivre: {
    label: "Comprar no Mercado Livre",
    short: "Mercado Livre",
    className: "bg-[#FFE600] hover:bg-[#e6cf00] text-black",
  },
  shopee: {
    label: "Comprar na Shopee",
    short: "Shopee",
    className: "bg-[#EE4D2D] hover:bg-[#d64529] text-white",
  },
}

function resolveCtaLabel(opts: { storeShort: string; price?: number; isPrimary?: boolean }) {
  const { storeShort, price, isPrimary } = opts
  const hasValidPrice = typeof price === "number" && Number.isFinite(price) && price > 0

  if (isPrimary) {
    return hasValidPrice ? `Comprar agora na ${storeShort}` : `Ver oferta na ${storeShort}`
  }

  return hasValidPrice ? `Ver na ${storeShort}` : `Ver oferta na ${storeShort}`
}

// ✅ In-app detection: importante para evitar _blank (drop no FB/IG/TikTok)
function isInAppBrowserUA(ua: string) {
  return /FBAN|FBAV|FB_IAB|Instagram|TikTok|BytedanceWebview|Line|Pinterest|Snapchat|WhatsApp/i.test(ua)
}

function isMobileUA(ua: string) {
  return /Android|iPhone|iPad|iPod/i.test(ua)
}

export function StoreButton({
  store,
  productId,
  productSlug,
  price,
  category,
  href,
  className,
  target = "_self",
  showExternalIcon = false,
  isPrimary = false,
  overrideLabel,
  disabled,
}: StoreButtonProps) {
  const ui = STORE_UI[store]
  const isDisabled = disabled || !href || href === "#"
  const label = overrideLabel || resolveCtaLabel({ storeShort: ui.short, price, isPrimary })

  const effectiveTarget = useMemo<"_blank" | "_self">(() => {
    if (target !== "_blank") return "_self"
    if (typeof navigator === "undefined") return "_blank"

    const ua = navigator.userAgent || ""
    // ✅ in-app + mobile: força mesma aba (menos bug e menos drop)
    if (isInAppBrowserUA(ua) || isMobileUA(ua)) return "_self"

    return "_blank"
  }, [target])

  const rel =
    effectiveTarget === "_blank"
      ? "noopener noreferrer nofollow sponsored"
      : "nofollow sponsored"

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (isDisabled) {
      e.preventDefault()
      return
    }

    // ✅ Track intent (best-effort). Não bloquear navegação.
    try {
      trackBuyClick({
        productId,
        productSlug,
        category,
        store,
        price,
        priceCents: typeof price === "number" ? Math.round(price * 100) : undefined,
        outboundUrl: href, // normalmente /api/go?... (ok p/ debug)
      })
    } catch {
      // no-op
    }
  }

  return (
    <Button
      asChild
      size="lg"
      disabled={isDisabled}
      className={cn(
        "w-full min-h-[56px] rounded-2xl text-base font-semibold shadow-button transition-all duration-200 active:scale-[0.98]",
        ui.className,
        isDisabled && "opacity-60 cursor-not-allowed",
        className
      )}
    >
      <a
        href={isDisabled ? undefined : href}
        target={effectiveTarget}
        onClick={handleClick}
        rel={rel}
        aria-label={`${label} (abre ${effectiveTarget === "_blank" ? "em nova aba" : "na mesma aba"})`}
      >
        {label}
        {showExternalIcon && effectiveTarget === "_blank" && <ExternalLink className="ml-2 h-4 w-4" />}
      </a>
    </Button>
  )
}

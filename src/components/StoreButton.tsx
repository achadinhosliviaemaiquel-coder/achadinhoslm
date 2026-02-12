import { Button } from "@/components/ui/button"
import { ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { trackBuyClick } from "@/lib/clickTracking"
import React from "react"

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
        outboundUrl: href,
      })
    } catch {
      // no-op
    }
    // ✅ deixa o navegador navegar normalmente para o href (que deve ser /api/go?...)
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
        target={target}
        onClick={handleClick}
        rel={target === "_blank" ? "noopener noreferrer nofollow sponsored" : "nofollow sponsored"}
        aria-label={`${label} (abre ${target === "_blank" ? "em nova aba" : "na mesma aba"})`}
      >
        {label}
        {showExternalIcon && target === "_blank" && <ExternalLink className="ml-2 h-4 w-4" />}
      </a>
    </Button>
  )
}

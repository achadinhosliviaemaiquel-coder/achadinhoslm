import type { Offer } from "@/hooks/useRecentOffers"

const PLATFORM_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  shopee: { label: "S", bg: "bg-[#FF6B3D]", text: "text-white" },
  ml: { label: "M", bg: "bg-[#FFD54A]", text: "text-black" },
  amazon: { label: "A", bg: "bg-[#F5A623]", text: "text-white" },
}

function formatCurrency(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

interface OfferCardProps {
  offer: Offer
}

export function OfferCard({ offer }: OfferCardProps) {
  const badge = PLATFORM_BADGE[offer.platform] ?? { label: offer.platform[0]?.toUpperCase() ?? "?", bg: "bg-muted", text: "text-foreground" }
  const displayPrice = offer.final_price ?? offer.price
  const hasDiscount = offer.old_price != null && offer.old_price > displayPrice

  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden flex flex-col h-full">
      {/* IMAGEM */}
      <div className="p-3">
        <div className="relative aspect-square rounded-xl bg-muted/40 overflow-hidden">
          <img
            src={offer.image_url || "/placeholder.svg"}
            alt={offer.title}
            className="w-full h-full object-contain"
            loading="lazy"
          />

          {/* Badge plataforma */}
          <span
            className={`absolute top-2 left-2 w-6 h-6 rounded-full ${badge.bg} ${badge.text} text-[11px] font-bold flex items-center justify-center shadow-sm`}
          >
            {badge.label}
          </span>

          {/* Badge desconto */}
          {offer.discount_pct != null && offer.discount_pct > 0 && (
            <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
              -{Math.round(offer.discount_pct)}%
            </span>
          )}
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="px-4 pb-4 flex flex-col flex-1">
        <h3 className="text-[13px] font-medium leading-snug text-foreground line-clamp-2 min-h-[2.5rem] mb-2">
          {offer.title}
        </h3>

        <div className="mt-auto pt-1 space-y-3">
          <div>
            {hasDiscount && (
              <span className="text-[11px] text-muted-foreground line-through block">
                {formatCurrency(offer.old_price!)}
              </span>
            )}
            <span className="text-[18px] font-bold text-emerald-700 leading-tight block">
              {formatCurrency(displayPrice)}
            </span>
            {offer.coupon_code && (
              <span className="inline-block mt-1 text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-md">
                Cupom: {offer.coupon_code}
              </span>
            )}
          </div>

          <a
            href={offer.url}
            target="_blank"
            rel="noopener noreferrer sponsored"
            className="block w-full text-center bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90 transition"
          >
            Ver oferta
          </a>
        </div>
      </div>
    </div>
  )
}

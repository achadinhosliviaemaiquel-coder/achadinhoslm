import { type RecentOffer } from "@/hooks/useRecentOffers";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

const PLATFORM_LABELS: Record<string, { label: string; color: string }> = {
  shopee: { label: "Shopee", color: "bg-orange-100 text-orange-700" },
  mercadolivre: { label: "ML", color: "bg-yellow-100 text-yellow-700" },
  ml: { label: "ML", color: "bg-yellow-100 text-yellow-700" },
  amazon: { label: "Amazon", color: "bg-blue-100 text-blue-700" },
};

function formatBRL(value: number | null) {
  if (value == null) return null;
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

type Props = {
  offer: RecentOffer;
};

export function OfferCard({ offer }: Props) {
  const platform = PLATFORM_LABELS[offer.platform?.toLowerCase()] ?? {
    label: offer.platform,
    color: "bg-muted text-muted-foreground",
  };

  const displayPrice = offer.final_price ?? offer.price;
  const hasDiscount =
    offer.discount_pct != null && offer.discount_pct >= 5;

  return (
    <a
      href={offer.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col bg-background rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow group shrink-0 w-[160px] sm:w-[180px]"
    >
      {/* Imagem */}
      <div className="relative aspect-square bg-muted overflow-hidden">
        {offer.image_url ? (
          <img
            src={offer.image_url}
            alt={offer.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-3xl">
            🛍️
          </div>
        )}
        {/* Badge desconto */}
        {hasDiscount && (
          <div className="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-md">
            -{Math.round(offer.discount_pct!)}%
          </div>
        )}
        {/* Badge plataforma */}
        <div
          className={`absolute top-2 right-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${platform.color}`}
        >
          {platform.label}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-2.5 flex flex-col gap-1 flex-1">
        <p className="text-xs text-foreground font-medium leading-snug line-clamp-2">
          {offer.title}
        </p>

        <div className="mt-auto pt-1">
          {offer.old_price && offer.old_price > (displayPrice ?? 0) && (
            <p className="text-[10px] text-muted-foreground line-through">
              {formatBRL(offer.old_price)}
            </p>
          )}
          {displayPrice != null && (
            <p className="text-sm font-bold text-green-600">
              {formatBRL(displayPrice)}
            </p>
          )}
          {offer.coupon_code && (
            <p className="text-[10px] text-primary font-mono mt-0.5">
              🎟 {offer.coupon_code}
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-2.5 pb-2 flex items-center gap-1 text-[10px] text-primary font-medium">
        Ver oferta <ExternalLink className="h-2.5 w-2.5" />
      </div>
    </a>
  );
}

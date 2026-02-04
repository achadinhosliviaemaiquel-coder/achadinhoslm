import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_LABELS, type Product } from "@/types/product"
import { getLowestPrice, formatCurrency } from "@/lib/utils"

interface ProductCardProps {
  product: Product
}

/* Função segura */
function parsePrice(label?: string | null): number | null {
  if (!label) return null
  const value = label.replace(/[^\d,]/g, "").replace(",", ".")
  const parsed = parseFloat(value)
  return isNaN(parsed) ? null : parsed
}

export function ProductCard({ product }: ProductCardProps) {
  const lowestPrice = getLowestPrice(product) ?? null
  const manualPrice = parsePrice(product.price_label)

  let finalPrice: number | null = null

  if (lowestPrice && manualPrice) {
    finalPrice = Math.min(lowestPrice, manualPrice)
  } else {
    finalPrice = lowestPrice ?? manualPrice
  }

  return (
    <Link
      to={`/product/${product.slug}`}
      className="
        bg-white
        rounded-2xl
        p-4                         /* ↓ menos padding */
        shadow-sm
        hover:shadow-md
        active:scale-[0.98]          /* feedback toque */
        transition-all duration-200
        flex flex-col
        min-w-[165px]                /* ↓ mais compacto */
        max-w-[200px]
        snap-start
      "
    >
      {/* IMAGE */}
      <div className="relative aspect-square rounded-xl overflow-hidden bg-muted mb-3">
        <img
          src={product.image_urls?.[0] || "/placeholder.svg"}
          alt={product.name}
          className="w-full h-full object-cover"
        />

        {product.urgency_label && (
          <span className="absolute top-2 left-2 bg-amber-300 text-black text-[10px] font-semibold px-2 py-0.5 rounded-md">
            {product.urgency_label}
          </span>
        )}
      </div>

      {/* CATEGORY */}
      <Badge className="text-[10px] bg-muted text-muted-foreground font-medium px-2 py-0.5 rounded-md w-fit mb-1">
        {product.categories?.name ?? "Categoria"}
      </Badge>

      {/* NAME */}
      <h3 className="
        text-[14px]
        font-medium
        leading-snug
        text-foreground
        line-clamp-2                 /* ↓ antes 3 linhas */
        min-h-[2.8rem]
        break-words
      ">
        {product.name}
      </h3>

      {/* PRICE */}
      <div className="mt-2 flex flex-col">
        {finalPrice ? (
          <>
            <span className="text-[10px] text-muted-foreground font-medium">
              A partir de
            </span>

            <span className="text-[19px] font-bold text-emerald-700 leading-tight">
              {formatCurrency(finalPrice)}
            </span>
          </>
        ) : (
          <span className="text-sm text-muted-foreground">Ver oferta</span>
        )}
      </div>

      {/* STORE ICONS */}
      <div className="flex gap-2 pt-2 opacity-80 mt-auto">
        {product.shopee_link && (
          <span className="w-5 h-5 rounded-full bg-[#FF6B3D] flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
            S
          </span>
        )}
        {product.mercadolivre_link && (
          <span className="w-5 h-5 rounded-full bg-[#FFD54A] flex items-center justify-center text-black text-[10px] font-bold shadow-sm">
            M
          </span>
        )}
        {product.amazon_link && (
          <span className="w-5 h-5 rounded-full bg-[#F5A623] flex items-center justify-center text-white text-[10px] font-bold shadow-sm">
            A
          </span>
        )}
      </div>
    </Link>
  )
}

import { Link } from "react-router-dom"
import { Badge } from "@/components/ui/badge"
import type { Product } from "@/types/product"
import { getLowestPrice, formatCurrency } from "@/lib/utils"
import { CATEGORY_LABELS } from "@/types/product"

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

// ✅ humaniza slug (limpeza-facial -> Limpeza Facial | protetor_solar -> Protetor Solar)
function humanizeSlug(s?: string | null): string {
  if (!s) return ""
  return s
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function ProductCard({ product }: ProductCardProps) {
  const lowestPrice = getLowestPrice(product) ?? null
  const manualPrice = parsePrice(product.price_label)

  const finalPrice =
    lowestPrice && manualPrice ? Math.min(lowestPrice, manualPrice) : (lowestPrice ?? manualPrice)

  // ✅ Badge correto: Categoria + Subcategoria (se existir)
  const categorySlug = (product as any).category as string | undefined
  const subSlug = (product as any).subcategory as string | undefined

  const categoryLabel = categorySlug ? (CATEGORY_LABELS as any)[categorySlug] ?? humanizeSlug(categorySlug) : "Categoria"
  const subLabel = subSlug ? humanizeSlug(subSlug) : null

  const badgeText = subLabel ? `${categoryLabel} • ${subLabel}` : categoryLabel

  return (
    <Link
      to={`/product/${product.slug}`}
      className="
        bg-white rounded-2xl shadow-sm hover:shadow-md transition
        overflow-hidden flex flex-col h-full
        active:scale-[0.99]
        w-full
      "
    >
      {/* IMAGEM: área fixa e consistente */}
      <div className="p-3">
        <div className="relative aspect-square rounded-xl bg-muted/40 overflow-hidden">
          <img
            src={product.image_urls?.[0] || "/placeholder.svg"}
            alt={product.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />

          {product.urgency_label && (
            <span className="absolute top-2 left-2 bg-amber-300 text-black text-[10px] font-semibold px-2 py-0.5 rounded-md">
              {product.urgency_label}
            </span>
          )}
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="px-4 pb-3 flex flex-col flex-1">
        <Badge className="text-[10px] bg-muted text-muted-foreground font-medium px-2 py-0.5 rounded-md w-fit mb-2">
          {badgeText}
        </Badge>

        {/* 3 linhas = simétrico (Amazon) */}
        <h3 className="text-[14px] font-medium leading-snug text-foreground line-clamp-3 md:line-clamp-2 min-h-[3.9rem] md:min-h-[2.6rem]">
          {product.name}
        </h3>

        {/* Rodapé alinhado */}
        <div className="mt-auto pt-2">
          {finalPrice ? (
            <>
              <span className="text-[10px] text-muted-foreground font-medium">A partir de</span>
              <span className="block text-[18px] font-bold text-emerald-700 leading-tight">
                {formatCurrency(finalPrice)}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Ver oferta</span>
          )}

          <div className="flex gap-2 pt-2 opacity-80">
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
        </div>
      </div>
    </Link>
  )
}

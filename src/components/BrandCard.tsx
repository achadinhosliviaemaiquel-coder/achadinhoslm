import { Link } from "react-router-dom"

interface BrandCardProps {
  category: string
  name: string
  logo: string
  slug: string
  count: number
}

export function BrandCard({ category, name, logo, slug, count }: BrandCardProps) {
  return (
    <Link
      to={`/${category}/marca/${slug}`}
      className="flex flex-col items-center justify-center bg-white rounded-xl border border-gray-100 shadow-sm p-4 min-w-[120px] snap-start active:scale-95 transition"
    >
      <img
        src={logo}
        alt={name}
        className="h-12 object-contain mb-2"
        loading="lazy"
        onError={(e) => {
          ;(e.currentTarget as HTMLImageElement).src = "/placeholder.svg"
        }}
      />

      <span className="text-sm font-semibold text-center line-clamp-1">
        {name}
      </span>

      <span className="text-xs text-muted-foreground">
        {count} produtos
      </span>
    </Link>
  )
}

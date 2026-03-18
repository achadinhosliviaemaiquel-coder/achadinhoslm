import { Layout } from "@/components/Layout"
import { Badge } from "@/components/ui/badge"
import { Star } from "lucide-react"

type ReviewProduct = {
  id: number
  name: string
  image: string
  category: string
  rating: number
  reviewUrl: string
}

const MOCK_REVIEWS: ReviewProduct[] = [
  {
    id: 1,
    name: "Protetor Solar Facial FPS 60 - La Roche-Posay",
    image: "/placeholder.svg",
    category: "Beleza",
    rating: 5,
    reviewUrl: "#",
  },
  {
    id: 2,
    name: "Fone de Ouvido Bluetooth sem fio",
    image: "/placeholder.svg",
    category: "Eletrônicos",
    rating: 4,
    reviewUrl: "#",
  },
  {
    id: 3,
    name: "Suplemento Vitamina C 500mg",
    image: "/placeholder.svg",
    category: "Suplementos",
    rating: 5,
    reviewUrl: "#",
  },
  {
    id: 4,
    name: "Kit Skincare Hidratante + Sérum",
    image: "/placeholder.svg",
    category: "Beleza",
    rating: 4,
    reviewUrl: "#",
  },
  {
    id: 5,
    name: "Panela de Pressão Elétrica 5L",
    image: "/placeholder.svg",
    category: "Casa",
    rating: 4,
    reviewUrl: "#",
  },
  {
    id: 6,
    name: "Tênis Running Feminino Leve",
    image: "/placeholder.svg",
    category: "Moda",
    rating: 5,
    reviewUrl: "#",
  },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-4 w-4 ${star <= rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"}`}
        />
      ))}
    </div>
  )
}

function ReviewCard({ product }: { product: ReviewProduct }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden flex flex-col">
      <div className="p-3">
        <div className="aspect-square rounded-xl bg-muted/40 overflow-hidden">
          <img
            src={product.image}
            alt={product.name}
            className="w-full h-full object-contain"
            loading="lazy"
          />
        </div>
      </div>

      <div className="px-4 pb-4 flex flex-col flex-1">
        <Badge className="text-[10px] bg-muted text-muted-foreground font-medium px-2 py-0.5 rounded-md w-fit mb-2">
          {product.category}
        </Badge>

        <h3 className="text-[14px] font-medium leading-snug text-foreground line-clamp-2 mb-2">
          {product.name}
        </h3>

        <div className="mt-auto pt-2 space-y-3">
          <StarRating rating={product.rating} />

          <a
            href={product.reviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center bg-primary text-primary-foreground text-sm font-medium py-2 rounded-lg hover:opacity-90 transition"
          >
            Ver review
          </a>
        </div>
      </div>
    </div>
  )
}

export default function ReviewsPage() {
  return (
    <Layout
      seo={{
        title: "Reviews de Produtos | Achadinhos LM",
        description:
          "Avaliações e reviews honestos dos melhores produtos da Shopee, Amazon e Mercado Livre. Confira antes de comprar!",
        canonical: "/reviews",
        ogType: "website",
      }}
    >
      <div className="space-y-8">
        <section className="text-center space-y-2">
          <h1 className="text-2xl font-bold">Reviews de Produtos</h1>
          <p className="text-muted-foreground">
            Avaliações honestas para você comprar com confiança.
          </p>
        </section>

        <section>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {MOCK_REVIEWS.map((product) => (
              <ReviewCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      </div>
    </Layout>
  )
}

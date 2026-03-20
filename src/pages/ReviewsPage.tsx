import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
const supabase = getSupabase();
import { Layout } from "@/components/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, ExternalLink, Instagram } from "lucide-react";

type ProductWithReview = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  image_urls: string[];
  review_url: string;
  shopee_price: number | null;
  mercadolivre_price: number | null;
  amazon_price: number | null;
  shopee_link: string | null;
  mercadolivre_link: string | null;
  amazon_link: string | null;
};

function useReviewProducts() {
  return useQuery({
    queryKey: ["review-products"],
    queryFn: async (): Promise<ProductWithReview[]> => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, category, description, image_urls, review_url, shopee_price, mercadolivre_price, amazon_price, shopee_link, mercadolivre_link, amazon_link"
        )
        .not("review_url", "is", null)
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data as ProductWithReview[]) ?? [];
    },
    staleTime: 1000 * 60 * 10,
  });
}

function lowestPrice(p: ProductWithReview): number | null {
  const prices = [p.shopee_price, p.mercadolivre_price, p.amazon_price].filter(
    (v): v is number => v != null && v > 0
  );
  return prices.length > 0 ? Math.min(...prices) : null;
}

function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ReviewCard({ product }: { product: ProductWithReview }) {
  const price = lowestPrice(product);
  const firstImage = product.image_urls?.[0];

  return (
    <div className="bg-background rounded-2xl border border-border overflow-hidden hover:shadow-md transition-shadow">
      {/* Imagem */}
      <div className="relative aspect-square bg-muted overflow-hidden">
        {firstImage ? (
          <img
            src={firstImage}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            🛍️
          </div>
        )}
        {/* Badge Instagram */}
        <div className="absolute top-2 right-2 bg-gradient-to-br from-purple-500 to-pink-500 p-1.5 rounded-lg">
          <Instagram className="h-3.5 w-3.5 text-white" />
        </div>
      </div>

      {/* Conteúdo */}
      <div className="p-4 space-y-3">
        <div>
          <p className="text-xs text-muted-foreground capitalize mb-1">
            {product.category}
          </p>
          <h3 className="font-semibold text-sm leading-snug line-clamp-2">
            {product.name}
          </h3>
        </div>

        {product.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {product.description}
          </p>
        )}

        {/* Estrelas fixas por enquanto — futuro: dinâmicas */}
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              className={`h-3.5 w-3.5 ${
                i <= 5
                  ? "fill-amber-400 text-amber-400"
                  : "text-muted-foreground"
              }`}
            />
          ))}
          <span className="text-xs text-muted-foreground ml-1">Recomendo</span>
        </div>

        {price != null && (
          <p className="text-sm font-bold text-green-600">
            A partir de {formatBRL(price)}
          </p>
        )}

        {/* Botão */}
        <a
          href={product.review_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline underline-offset-4"
        >
          <Instagram className="h-3.5 w-3.5" />
          Ver review no Instagram
          <ExternalLink className="h-3 w-3" />
        </a>

        {/* Links de compra */}
        <div className="flex gap-2 flex-wrap pt-1">
          {product.shopee_link && (
            <a
              href={product.shopee_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-medium bg-orange-100 text-orange-700 px-2 py-1 rounded-full hover:bg-orange-200 transition-colors"
            >
              Shopee
            </a>
          )}
          {product.mercadolivre_link && (
            <a
              href={product.mercadolivre_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-medium bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full hover:bg-yellow-200 transition-colors"
            >
              Mercado Livre
            </a>
          )}
          {product.amazon_link && (
            <a
              href={product.amazon_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] font-medium bg-blue-100 text-blue-700 px-2 py-1 rounded-full hover:bg-blue-200 transition-colors"
            >
              Amazon
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReviewsPage() {
  const { data: products, isLoading, error } = useReviewProducts();

  return (
    <Layout
      seo={{
        title: "Reviews de Produtos | Achadinhos LM",
        description:
          "Confira os reviews de produtos testados e aprovados pelo Achadinhos LM. Avaliações honestas com links para comprar nas melhores lojas.",
        canonical: "/reviews",
      }}
    >
      <div className="space-y-8">
        {/* Header da página */}
        <section className="space-y-2">
          <h1 className="text-2xl font-bold">📹 Reviews</h1>
          <p className="text-muted-foreground text-sm">
            Produtos que testei pessoalmente e recomendo. Clique em "Ver review"
            para assistir no Instagram.
          </p>
        </section>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-muted-foreground text-center py-12">
            Erro ao carregar reviews. Tente novamente.
          </p>
        ) : products && products.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {products.map((product) => (
              <ReviewCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 space-y-3">
            <span className="text-5xl">📹</span>
            <p className="text-muted-foreground">
              Nenhum review publicado ainda. Em breve!
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}

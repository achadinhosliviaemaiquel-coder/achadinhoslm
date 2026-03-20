import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { CategoryCard } from "@/components/CategoryCard";
import { OfferCard } from "@/components/OfferCard";
import { useFeaturedProducts } from "@/hooks/useFeaturedProducts";
import { useRecentOffers } from "@/hooks/useRecentOffers";
import { getSupabase } from "@/integrations/supabase/client";
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product";
import { Skeleton } from "@/components/ui/skeleton";
import { Star, Instagram, ExternalLink } from "lucide-react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";

const supabase = getSupabase();

const CATEGORIES = (Object.keys(CATEGORY_LABELS) as ProductCategory[]).sort(
  (a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b])
);

// Barra separadora de seção (igual ao mockup)
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 px-4 py-1 bg-muted border-y border-border">
      <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
        {children}
      </span>
    </div>
  );
}

const WhatsAppIcon = () => (
  <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor">
    <path d="M16 .4C7.4.4.4 7.4.4 16c0 2.8.7 5.6 2.1 8L.3 31.7l7.9-2.1c2.3 1.3 5 2 7.8 2 8.6 0 15.6-7 15.6-15.6S24.6.4 16 .4zm0 28.5c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-4.7 1.3 1.3-4.6-.3-.5C3.8 20.8 3.2 18.5 3.2 16 3.2 9.2 9.2 3.2 16 3.2S28.8 9.2 28.8 16 22.8 28.9 16 28.9zm7.2-9.6c-.4-.2-2.3-1.1-2.7-1.2-.4-.1-.6-.2-.9.2s-1 1.2-1.2 1.4c-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.2-.3.3-.5.4-.8.1-.3 0-.6 0-.8 0-.2-.9-2.2-1.2-3-.3-.8-.6-.7-.9-.7h-.8c-.3 0-.8.1-1.2.6-.4.5-1.5 1.4-1.5 3.4s1.6 3.9 1.8 4.2c.2.3 3.1 4.8 7.6 6.7 1.1.5 1.9.7 2.5.9 1 .3 1.9.3 2.6.2.8-.1 2.3-.9 2.6-1.8.3-.9.3-1.7.2-1.8-.1-.1-.3-.2-.7-.4z" />
  </svg>
);

function ChannelButton({
  href,
  bg,
  children,
}: {
  href: string;
  bg: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center justify-center gap-3 ${bg} text-white py-3 rounded-xl font-semibold shadow-md max-w-[620px] mx-auto`}
    >
      {children}
    </a>
  );
}

type ReviewProduct = {
  id: string;
  name: string;
  slug: string;
  category: string;
  image_urls: string[];
  review_url: string;
};

function useReviewsPreview() {
  return useQuery({
    queryKey: ["reviews-preview"],
    queryFn: async (): Promise<ReviewProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, category, image_urls, review_url")
        .not("review_url", "is", null)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(4);
      if (error) throw error;
      return (data as ReviewProduct[]) ?? [];
    },
    staleTime: 1000 * 60 * 10,
  });
}

function ReviewPreviewCard({ product }: { product: ReviewProduct }) {
  const firstImage = product.image_urls?.[0];
  return (
    <div className="bg-background rounded-xl border border-border overflow-hidden hover:shadow-md transition-shadow">
      <div className="relative aspect-square bg-muted overflow-hidden">
        {firstImage ? (
          <img
            src={firstImage}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">🛍️</div>
        )}
        <div className="absolute top-2 right-2 bg-gradient-to-br from-purple-500 to-pink-500 p-1.5 rounded-lg">
          <Instagram className="h-3.5 w-3.5 text-white" />
        </div>
      </div>
      <div className="p-3 space-y-1.5">
        <p className="text-[10px] text-muted-foreground capitalize">{product.category}</p>
        <p className="text-xs font-semibold leading-snug line-clamp-2">{product.name}</p>
        <div className="flex gap-0.5">
          {[1,2,3,4,5].map(i => (
            <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <a
          href={product.review_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] font-medium text-primary hover:underline"
        >
          Ver review <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}

export default function Index() {
  const { data: products, isLoading: loadingFeatured } = useFeaturedProducts(6);
  const { data: recentOffers, isLoading: loadingOffers } = useRecentOffers(12);
  const { data: reviewProducts } = useReviewsPreview();

  const hasOffers = !loadingOffers && recentOffers && recentOffers.length > 0;
  const hasReviews = reviewProducts && reviewProducts.length > 0;

  return (
    <Layout
      seo={{
        title: "Achadinhos e Promoções da Shopee, Amazon e Mercado Livre | Achadinhos LM",
        description:
          "Encontre achadinhos, promoções e produtos baratos da Shopee, Amazon e Mercado Livre. Ofertas de beleza, casa, eletrônicos, moda e suplementos com preços baixos.",
        canonical: "/",
        ogImage: "/og-home.jpg",
        ogType: "website",
      }}
    >
      <div className="space-y-6">
        {/* HERO */}
        <section className="text-center space-y-3 animate-fade-in max-w-[820px] mx-auto">
          <h1 className="text-2xl font-bold">
            Achadinhos e Promoções Imperdíveis da Shopee, Amazon e Mercado Livre
          </h1>
          <p className="text-muted-foreground">
            Ofertas atualizadas com preços baixos todos os dias.
          </p>
        </section>

        {/* CANAIS */}
        <section className="space-y-3 px-2">
          <ChannelButton href="https://whatsapp.com/channel/0029VbCHBwUGzzKIsFbuHR15" bg="bg-[#25D366]">
            <WhatsAppIcon />
            Canal de ofertas no WhatsApp
          </ChannelButton>
          <ChannelButton href="https://chat.whatsapp.com/Bvyh4RUuNA32qVtlHgiZJu" bg="bg-[#128C7E]">
            <WhatsAppIcon />
            Grupo VIP no WhatsApp
          </ChannelButton>
          <ChannelButton href="https://t.me/achadinhosliviamaiquel" bg="bg-[#229ED9]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.04 15.36l-.38 5.36c.55 0 .79-.23 1.08-.51l2.6-2.47 5.39 3.94c.99.55 1.69.26 1.95-.92l3.53-16.53c.31-1.44-.52-2.01-1.48-1.65L1.9 10.15c-1.4.55-1.38 1.34-.24 1.69l4.9 1.53L18.44 6.1c.56-.36 1.08-.16.66.2" />
            </svg>
            Canal de ofertas no Telegram
          </ChannelButton>
        </section>

        {/* ——— POSTADAS AGORA ——— */}
        {(hasOffers || loadingOffers) && (
          <SectionLabel>Novo — alimentado pelo n8n automaticamente</SectionLabel>
        )}

        {loadingOffers && (
          <section className="space-y-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-4 w-48" />
            <div className="flex gap-3 overflow-hidden -mx-4 px-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="shrink-0 w-[160px] space-y-2">
                  <Skeleton className="aspect-square rounded-xl" />
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          </section>
        )}

        {hasOffers && (
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Postadas agora</h2>
              <p className="text-sm text-muted-foreground">Chegaram hoje nos grupos</p>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
              {recentOffers!.map((offer) => (
                <OfferCard key={offer.id} offer={offer} />
              ))}
            </div>
            <p className="text-center text-[10px] text-muted-foreground tracking-wide">
              ← deslize para ver mais →
            </p>
          </section>
        )}

        {/* ——— CATEGORIAS ——— */}
        <SectionLabel>Sem alteração</SectionLabel>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Categorias</h2>
          <div className="max-w-[950px] mx-auto grid grid-cols-3 gap-4">
            {CATEGORIES.map((category) => (
              <CategoryCard key={category} category={category} />
            ))}
          </div>
        </section>

        {/* ——— REVIEWS DO INSTAGRAM ——— */}
        {hasReviews && (
          <>
            <SectionLabel>Novo — produtos do Instagram</SectionLabel>

            <section className="space-y-3">
              <div>
                <h2 className="text-lg font-semibold">Reviews do Instagram</h2>
                <p className="text-sm text-muted-foreground">Produtos que testei e aprovei</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {reviewProducts!.slice(0, 4).map((product) => (
                  <ReviewPreviewCard key={product.id} product={product} />
                ))}
              </div>
              <div className="text-center pt-1">
                <Link
                  to="/reviews"
                  className="text-sm font-medium text-primary hover:underline underline-offset-4"
                >
                  Ver todos os reviews →
                </Link>
              </div>
            </section>
          </>
        )}

        {/* ——— EM ALTA ——— */}
        <SectionLabel>Sem alteração</SectionLabel>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">🔥 Em alta</h2>
          <p className="text-sm text-muted-foreground">
            Mais clicados nos últimos 7 dias
          </p>
          {loadingFeatured ? (
            <div className="flex gap-4 overflow-hidden">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="w-44 space-y-3">
                  <Skeleton className="aspect-square rounded-2xl" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <Carousel opts={{ align: "start", dragFree: true }} className="w-full">
              <CarouselContent className="-ml-3">
                {products.map((product) => (
                  <CarouselItem
                    key={product.id}
                    className="pl-3 !basis-[170px] sm:!basis-[190px] md:!basis-[210px] lg:!basis-[230px] xl:!basis-[240px] !shrink-0"
                  >
                    <ProductCard product={product} />
                  </CarouselItem>
                ))}
              </CarouselContent>
              <div className="hidden md:block">
                <CarouselPrevious />
                <CarouselNext />
              </div>
            </Carousel>
          ) : (
            <div className="text-center py-12 space-y-4">
              <span className="text-4xl">📦</span>
              <p className="text-muted-foreground">
                Ainda estamos coletando dados de cliques. Explore as categorias acima 👆
              </p>
            </div>
          )}
        </section>

        {/* TEXTO SEO */}
        <section className="text-sm text-muted-foreground leading-relaxed max-w-3xl mx-auto text-center pt-6">
          O Achadinhos LM reúne promoções e produtos baratos da Shopee, Amazon e Mercado Livre.
          Aqui você encontra achadinhos de beleza, casa, moda, eletrônicos e suplementos com
          preços que valem a pena. Selecionamos ofertas reais para facilitar sua busca por descontos.
        </section>
      </div>
    </Layout>
  );
}

import { Layout } from '@/components/Layout'
import { ProductCard } from '@/components/ProductCard'
import { CategoryCard } from '@/components/CategoryCard'
import { useFeaturedProducts } from '@/hooks/useFeaturedProducts'
import { CATEGORY_LABELS, type ProductCategory } from '@/types/product'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel"
import { Helmet } from "react-helmet-async"

const CATEGORIES = (Object.keys(CATEGORY_LABELS) as ProductCategory[])
  .sort((a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b]))

const WhatsAppIcon = () => (
  <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor">
    <path d="M16 .4C7.4.4.4 7.4.4 16c0 2.8.7 5.6 2.1 8L.3 31.7l7.9-2.1c2.3 1.3 5 2 7.8 2 8.6 0 15.6-7 15.6-15.6S24.6.4 16 .4zm0 28.5c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-4.7 1.3 1.3-4.6-.3-.5C3.8 20.8 3.2 18.5 3.2 16 3.2 9.2 9.2 3.2 16 3.2S28.8 9.2 28.8 16 22.8 28.9 16 28.9zm7.2-9.6c-.4-.2-2.3-1.1-2.7-1.2-.4-.1-.6-.2-.9.2s-1 1.2-1.2 1.4c-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.2-.3.3-.5.4-.8.1-.3 0-.6 0-.8 0-.2-.9-2.2-1.2-3-.3-.8-.6-.7-.9-.7h-.8c-.3 0-.8.1-1.2.6-.4.5-1.5 1.4-1.5 3.4s1.6 3.9 1.8 4.2c.2.3 3.1 4.8 7.6 6.7 1.1.5 1.9.7 2.5.9 1 .3 1.9.3 2.6.2.8-.1 2.3-.9 2.6-1.8.3-.9.3-1.7.2-1.8-.1-.1-.3-.2-.7-.4z" />
  </svg>
)

function ChannelButton({ href, bg, children }: {
  href: string
  bg: string
  children: React.ReactNode
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
  )
}

export default function Index() {
  const { data: products, isLoading } = useFeaturedProducts()

  return (
    <Layout>
      <Helmet>
        <title>Achadinhos e Promoções da Shopee, Amazon e Mercado Livre | Achadinhos LM</title>
        <meta
          name="description"
          content="Encontre achadinhos, promoções e produtos baratos da Shopee, Amazon e Mercado Livre. Ofertas de beleza, casa, eletrônicos, moda e suplementos com preços baixos."
        />
      </Helmet>

      <div className="space-y-10">

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

        {/* CATEGORIAS */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Categorias</h2>
          <div className="max-w-[950px] mx-auto grid grid-cols-3 gap-5 mt-3">
            {CATEGORIES.map((category) => (
              <CategoryCard key={category} category={category} />
            ))}
          </div>
        </section>

        {/* MAIS VISTOS */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">🔥 Mais vistos</h2>

          {isLoading ? (
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
              <CarouselContent className="ml-4">
                {products.map((product) => (
                  <CarouselItem key={product.id} className="min-w-[170px] sm:min-w-[190px] md:min-w-[210px] lg:min-w-[230px] xl:min-w-[240px] basis-auto">
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
              <p className="text-muted-foreground">Nenhum produto em destaque ainda.</p>
            </div>
          )}
        </section>

        {/* TEXTO SEO NO FINAL */}
        <section className="text-sm text-muted-foreground leading-relaxed max-w-3xl mx-auto text-center pt-10">
          O Achadinhos LM reúne promoções e produtos baratos da Shopee, Amazon e Mercado Livre.
          Aqui você encontra achadinhos de beleza, casa, moda, eletrônicos e suplementos com preços que valem a pena.
          Selecionamos ofertas reais para facilitar sua busca por descontos.
        </section>

      </div>
    </Layout>
  )
}
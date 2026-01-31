import { Layout } from '@/components/Layout';
import { ProductCard } from '@/components/ProductCard';
import { CategoryCard } from '@/components/CategoryCard';
import { useProducts } from '@/hooks/useProducts';
import { CATEGORY_LABELS, type ProductCategory } from '@/types/product';
import { Skeleton } from '@/components/ui/skeleton';

const CATEGORIES = (Object.keys(CATEGORY_LABELS) as ProductCategory[])
  .sort((a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b]));

export default function Index() {
  const { data: products, isLoading } = useProducts();

  return (
    <Layout>
      <div className="space-y-8">
        {/* Hero */}
        <section className="text-center space-y-3 animate-fade-in">
          <h1 className="text-2xl font-bold text-foreground">
            Achados & Ofertas 🛍️
          </h1>
          <p className="text-muted-foreground">
            Os melhores produtos com os menores preços
          </p>
        </section>
        <section className="space-y-3 px-2">
          {/* Canal WhatsApp */}
          <a
            href="https://whatsapp.com/channel/0029VbCHBwUGzzKIsFbuHR15"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-[#25D366] text-white py-3 rounded-xl font-semibold shadow-md"
          >
            <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 .4C7.4.4.4 7.4.4 16c0 2.8.7 5.6 2.1 8L.3 31.7l7.9-2.1c2.3 1.3 5 2 7.8 2 8.6 0 15.6-7 15.6-15.6S24.6.4 16 .4zm0 28.5c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-4.7 1.3 1.3-4.6-.3-.5C3.8 20.8 3.2 18.5 3.2 16 3.2 9.2 9.2 3.2 16 3.2S28.8 9.2 28.8 16 22.8 28.9 16 28.9zm7.2-9.6c-.4-.2-2.3-1.1-2.7-1.2-.4-.1-.6-.2-.9.2s-1 1.2-1.2 1.4c-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.2-.3.3-.5.4-.8.1-.3 0-.6 0-.8 0-.2-.9-2.2-1.2-3-.3-.8-.6-.7-.9-.7h-.8c-.3 0-.8.1-1.2.6-.4.5-1.5 1.4-1.5 3.4s1.6 3.9 1.8 4.2c.2.3 3.1 4.8 7.6 6.7 1.1.5 1.9.7 2.5.9 1 .3 1.9.3 2.6.2.8-.1 2.3-.9 2.6-1.8.3-.9.3-1.7.2-1.8-.1-.1-.3-.2-.7-.4z" />
            </svg>
            Canal de ofertas no WhatsApp
          </a>
          {/* Grupo WhatsApp */}
          <a
            href="https://chat.whatsapp.com/Bvyh4RUuNA32qVtlHgiZJu"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-[#128C7E] text-white py-3 rounded-xl font-semibold shadow-md"
          >
            <svg width="22" height="22" viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 .4C7.4.4.4 7.4.4 16c0 2.8.7 5.6 2.1 8L.3 31.7l7.9-2.1c2.3 1.3 5 2 7.8 2 8.6 0 15.6-7 15.6-15.6S24.6.4 16 .4zm0 28.5c-2.4 0-4.7-.6-6.7-1.8l-.5-.3-4.7 1.3 1.3-4.6-.3-.5C3.8 20.8 3.2 18.5 3.2 16 3.2 9.2 9.2 3.2 16 3.2S28.8 9.2 28.8 16 22.8 28.9 16 28.9zm7.2-9.6c-.4-.2-2.3-1.1-2.7-1.2-.4-.1-.6-.2-.9.2s-1 1.2-1.2 1.4c-.2.2-.4.3-.8.1-.4-.2-1.6-.6-3-1.8-1.1-1-1.8-2.2-2-2.6-.2-.4 0-.6.2-.8.2-.2.4-.4.6-.7.2-.3.3-.5.4-.8.1-.3 0-.6 0-.8 0-.2-.9-2.2-1.2-3-.3-.8-.6-.7-.9-.7h-.8c-.3 0-.8.1-1.2.6-.4.5-1.5 1.4-1.5 3.4s1.6 3.9 1.8 4.2c.2.3 3.1 4.8 7.6 6.7 1.1.5 1.9.7 2.5.9 1 .3 1.9.3 2.6.2.8-.1 2.3-.9 2.6-1.8.3-.9.3-1.7.2-1.8-.1-.1-.3-.2-.7-.4z" />
            </svg>
            Grupo VIP no WhatsApp
          </a>

          {/* Canal Telegram */}
          <a
            href="https://t.me/achadinhosliviamaiquel"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 bg-[#229ED9] text-white py-3 rounded-xl font-semibold shadow-md"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9.04 15.36l-.38 5.36c.55 0 .79-.23 1.08-.51l2.6-2.47 5.39 3.94c.99.55 1.69.26 1.95-.92l3.53-16.53.01-.01c.31-1.44-.52-2.01-1.48-1.65L1.9 10.15c-1.4.55-1.38 1.34-.24 1.69l4.9 1.53L18.44 6.1c.56-.36 1.08-.16.66.2" />
            </svg>
            Canal de ofertas no Telegram
          </a>
        </section>

        {/* Categories */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Categorias
          </h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-5 mt-3">
            {CATEGORIES.map((category) => (
              <CategoryCard key={category} category={category} />
            ))}
          </div>
        </section>

        {/* Products */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Destaques
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="aspect-square rounded-2xl" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-5 w-1/2" />
                </div>
              ))}
            </div>
          ) : products && products.length > 0 ? (
            <div className="grid grid-cols-2 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 space-y-4">
              <span className="text-4xl">📦</span>
              <p className="text-muted-foreground">
                Nenhum produto disponível ainda.
              </p>
              <p className="text-sm text-muted-foreground">
                Adicione produtos pelo painel de administração.
              </p>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

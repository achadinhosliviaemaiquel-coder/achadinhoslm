import { Layout } from '@/components/Layout';
import { ProductCard } from '@/components/ProductCard';
import { CategoryCard } from '@/components/CategoryCard';
import { useProducts } from '@/hooks/useProducts';
import { CATEGORY_LABELS, type ProductCategory } from '@/types/product';
import { Skeleton } from '@/components/ui/skeleton';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as ProductCategory[];

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
          <a
            href="https://whatsapp.com/channel/0029VbCHBwUGzzKIsFbuHR15"
            target="_blank"
            className="block bg-green-500 text-white text-center py-3 rounded-xl font-semibold shadow-md"
          >
            📲 Canal de ofertas no WhatsApp
          </a>

          <a
            href="https://t.me/achadinhosliviamaiquel"
            target="_blank"
            className="block bg-blue-500 text-white text-center py-3 rounded-xl font-semibold shadow-md"
          >
            ✈️ Canal de ofertas no Telegram
          </a>

          <a
            href="https://chat.whatsapp.com/Bvyh4RUuNA32qVtlHgiZJu"
            target="_blank"
            className="block bg-emerald-600 text-white text-center py-3 rounded-xl font-semibold shadow-md"
          >
            👥 Grupo VIP no WhatsApp
          </a>
        </section>

        {/* Categories */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Categorias
          </h2>
          <div className="grid grid-cols-4 gap-3">
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

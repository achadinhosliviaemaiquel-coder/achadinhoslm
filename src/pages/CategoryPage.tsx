import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProductsByCategory } from '@/hooks/useProducts';
import { trackCategoryView } from '@/lib/analytics';
import { CATEGORY_LABELS, CATEGORY_ICONS, type ProductCategory } from '@/types/product';
import { ChevronLeft } from 'lucide-react';

export default function CategoryPage() {
  const { category, subcategory } = useParams<{ category: string; subcategory?: string }>();
  const validCategory = category as ProductCategory;
  
  const { data: products, isLoading } = useProductsByCategory(validCategory, subcategory);

  useEffect(() => {
    if (category) {
      trackCategoryView(category, subcategory);
    }
  }, [category, subcategory]);

  const categoryLabel = CATEGORY_LABELS[validCategory] || category;
  const categoryIcon = CATEGORY_ICONS[validCategory] || '📦';

  return (
    <Layout>
      <div className="space-y-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Link>
        </Button>

        {/* Header */}
        <div className="text-center space-y-2 animate-fade-in">
          <span className="text-4xl">{categoryIcon}</span>
          <h1 className="text-2xl font-bold text-foreground">
            {categoryLabel}
          </h1>
          {subcategory && (
            <p className="text-muted-foreground">
              {subcategory}
            </p>
          )}
        </div>

        {/* Products */}
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
            <span className="text-4xl">🔍</span>
            <p className="text-muted-foreground">
              Nenhum produto encontrado nesta categoria.
            </p>
            <Button asChild>
              <Link to="/">Ver todas as ofertas</Link>
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}

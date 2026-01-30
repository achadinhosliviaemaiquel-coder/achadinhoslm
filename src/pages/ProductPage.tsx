import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { StoreButton } from '@/components/StoreButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProduct } from '@/hooks/useProducts';
import { trackProductView } from '@/lib/analytics';
import { CATEGORY_LABELS } from '@/types/product';
import { ChevronLeft, Check, AlertCircle } from 'lucide-react';

export default function ProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: product, isLoading, error } = useProduct(slug || '');

  useEffect(() => {
    if (product) {
      trackProductView(product.slug, product.category);
    }
  }, [product]);

  if (isLoading) {
    return (
      <Layout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="aspect-square rounded-2xl" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      </Layout>
    );
  }

  if (error || !product) {
    return (
      <Layout>
        <div className="text-center py-16 space-y-4">
          <span className="text-4xl">😢</span>
          <h1 className="text-xl font-semibold text-foreground">
            Produto não encontrado
          </h1>
          <Button asChild>
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </Layout>
    );
  }

  const hasStoreLinks = product.shopee_link || product.mercadolivre_link || product.amazon_link;

  return (
    <Layout>
      <div className="space-y-6 animate-fade-in">
        {/* Back button */}
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link to="/">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Voltar
          </Link>
        </Button>

        {/* Image */}
        <div className="relative aspect-square rounded-2xl overflow-hidden bg-muted shadow-card">
          <img
            src={product.image_urls?.[0] || '/placeholder.svg'}
            alt={product.name}
            className="w-full h-full object-cover"
          />
          {product.urgency_label && (
            <div className="absolute top-4 left-4">
              <Badge variant="destructive" className="text-sm font-semibold animate-pulse-soft">
                {product.urgency_label}
              </Badge>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-4">
          {/* Category */}
          <Link to={`/category/${product.category}`}>
            <Badge variant="secondary" className="hover:bg-secondary/80">
              {CATEGORY_LABELS[product.category]}
              {product.subcategory && ` › ${product.subcategory}`}
            </Badge>
          </Link>

          {/* Name */}
          <h1 className="text-2xl font-bold text-foreground leading-tight">
            {product.name}
          </h1>

          {/* Price */}
          <p className="text-3xl font-bold text-primary">
            {product.price_label}
          </p>

          {/* Description */}
          {product.description && (
            <p className="text-muted-foreground leading-relaxed">
              {product.description}
            </p>
          )}

          {/* Benefits */}
          {product.benefits && product.benefits.length > 0 && (
            <div className="space-y-2">
              <h2 className="font-semibold text-foreground">Benefícios</h2>
              <ul className="space-y-2">
                {product.benefits.map((benefit, index) => (
                  <li key={index} className="flex items-start gap-2 text-muted-foreground">
                    <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Store buttons */}
        {hasStoreLinks && (
          <div className="space-y-3 pt-2">
            <h2 className="font-semibold text-foreground text-center">
              Escolha onde comprar
            </h2>
            {product.shopee_link && (
              <StoreButton store="shopee" productSlug={product.slug} />
            )}
            {product.mercadolivre_link && (
              <StoreButton store="mercadolivre" productSlug={product.slug} />
            )}
            {product.amazon_link && (
              <StoreButton store="amazon" productSlug={product.slug} />
            )}
          </div>
        )}

        {/* Disclaimer */}
        <div className="bg-muted rounded-xl p-4 flex gap-3 items-start">
          <AlertCircle className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Este link é de afiliado. Ao comprar através dele, você nos ajuda a continuar 
            trazendo ofertas incríveis, sem nenhum custo adicional para você.
          </p>
        </div>
      </div>
    </Layout>
  );
}

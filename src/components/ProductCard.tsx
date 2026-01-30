import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { CATEGORY_LABELS } from '@/types/product';
import type { Product } from '@/types/product';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const imageUrl = product.image_urls?.[0] || '/placeholder.svg';
  
  return (
    <Link 
      to={`/product/${product.slug}`}
      className="group block animate-fade-in"
    >
      <article className="bg-card rounded-2xl shadow-card overflow-hidden transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
        {/* Image container */}
        <div className="relative aspect-square overflow-hidden bg-muted">
          <img
            src={imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            loading="lazy"
          />
          
          {/* Urgency badge */}
          {product.urgency_label && (
            <div className="absolute top-3 left-3">
              <Badge variant="destructive" className="text-xs font-semibold animate-pulse-soft">
                {product.urgency_label}
              </Badge>
            </div>
          )}
        </div>
        
        {/* Content */}
        <div className="p-4 space-y-2">
          {/* Category */}
          <Badge variant="secondary" className="text-xs">
            {CATEGORY_LABELS[product.category]}
          </Badge>
          
          {/* Name */}
          <h3 className="font-semibold text-foreground line-clamp-2 leading-tight">
            {product.name}
          </h3>
          
          {/* Price */}
          <p className="text-primary font-bold text-lg">
            {product.price_label}
          </p>
          
          {/* Store availability */}
          <div className="flex gap-2 pt-1">
            {product.shopee_link && (
              <span className="w-6 h-6 rounded-full bg-shopee flex items-center justify-center">
                <span className="text-shopee-foreground text-xs font-bold">S</span>
              </span>
            )}
            {product.mercadolivre_link && (
              <span className="w-6 h-6 rounded-full bg-mercadolivre flex items-center justify-center">
                <span className="text-mercadolivre-foreground text-xs font-bold">M</span>
              </span>
            )}
            {product.amazon_link && (
              <span className="w-6 h-6 rounded-full bg-amazon flex items-center justify-center">
                <span className="text-amazon-foreground text-xs font-bold">A</span>
              </span>
            )}
          </div>
        </div>
      </article>
    </Link>
  );
}

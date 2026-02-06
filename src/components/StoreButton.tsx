import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { trackBuyClick } from '@/lib/clickTracking';

interface StoreButtonProps {
  store: 'shopee' | 'mercadolivre' | 'amazon';
  productId: string;
  productSlug: string;
  price: number;
  category: string;
  className?: string;
}

const STORE_CONFIG = {
  shopee: {
    label: 'Comprar na Shopee',
    bgClass: 'bg-shopee hover:bg-shopee/90',
    textClass: 'text-shopee-foreground',
  },
  mercadolivre: {
    label: 'Comprar no Mercado Livre',
    bgClass: 'bg-mercadolivre hover:bg-mercadolivre/90',
    textClass: 'text-mercadolivre-foreground',
  },
  amazon: {
    label: 'Comprar na Amazon',
    bgClass: 'bg-amazon hover:bg-amazon/90',
    textClass: 'text-amazon-foreground',
  },
} as const;

export function StoreButton({
  store,
  productId,
  productSlug,
  price,
  category,
  className,
}: StoreButtonProps) {
  const config = STORE_CONFIG[store];

  const handleClick = () => {
    // ✅ Registra GA + Supabase
    // ✅ NÃO redireciona (o <Link> já vai navegar para /go/...)
    trackBuyClick({
      productId,
      productSlug,
      category,
      store,
      price,
      outboundUrl: `/go/${store}/${productSlug}`,
      redirectMode: "none",
    });
  };

  return (
    <Button
      asChild
      size="lg"
      className={cn(
        'w-full min-h-[56px] text-base font-semibold rounded-xl shadow-button transition-all duration-200 active:scale-[0.98]',
        config.bgClass,
        config.textClass,
        className
      )}
    >
      <Link to={`/go/${store}/${productSlug}`} onClick={handleClick}>
        {config.label}
        <ExternalLink className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}

import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StoreButtonProps {
  store: 'shopee' | 'mercadolivre' | 'amazon';
  productSlug: string;
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
};

export function StoreButton({ store, productSlug, className }: StoreButtonProps) {
  const config = STORE_CONFIG[store];
  
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
      <Link to={`/go/${store}/${productSlug}`}>
        {config.label}
        <ExternalLink className="ml-2 h-4 w-4" />
      </Link>
    </Button>
  );
}

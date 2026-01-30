import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, CATEGORY_ICONS, type ProductCategory } from '@/types/product';

interface CategoryCardProps {
  category: ProductCategory;
}

export function CategoryCard({ category }: CategoryCardProps) {
  return (
    <Link
      to={`/category/${category}`}
      className="group block animate-fade-in"
    >
      <div className="bg-card rounded-2xl p-6 shadow-soft transition-all duration-300 hover:shadow-card hover:-translate-y-1 text-center">
        <span className="text-4xl mb-3 block group-hover:animate-bounce-subtle">
          {CATEGORY_ICONS[category]}
        </span>
        <h3 className="font-semibold text-foreground">
          {CATEGORY_LABELS[category]}
        </h3>
      </div>
    </Link>
  );
}

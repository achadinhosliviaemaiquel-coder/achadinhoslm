import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, type ProductCategory } from '@/types/product';
import {
  ShoppingBag,
  Sparkles,
  Home,
  Smartphone,
  Gamepad2,
  Baby,
  PawPrint,
  Briefcase
} from 'lucide-react';

interface CategoryCardProps {
  category: ProductCategory;
}

const ICONS: Record<ProductCategory, any> = {
  moda: ShoppingBag,
  beleza: Sparkles,
  casa: Home,
  eletronicos: Smartphone,
  esportes: Gamepad2,
  infantil: Baby,
  pets: PawPrint,
  escritorio: Briefcase,
};

export function CategoryCard({ category }: CategoryCardProps) {
  const Icon = ICONS[category];

  return (
    <Link to={`/category/${category}`} className="group block animate-fade-in">
      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-gray-200 text-center">

        {/* Ícone */}
        <div className="mb-3 flex items-center justify-center h-12">
          <Icon
            size={30}
            strokeWidth={1.6}
            className={category === 'eletronicos' ? 'translate-y-[2px]' : ''}
          />
        </div>

        {/* Nome da categoria */}
        <h3 className="font-semibold text-sm text-gray-800">
          {CATEGORY_LABELS[category]}
        </h3>

      </div>
    </Link>
  );
}
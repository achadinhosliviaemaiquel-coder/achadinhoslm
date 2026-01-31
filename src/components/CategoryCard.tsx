import { Link } from 'react-router-dom';
import { CATEGORY_LABELS, type ProductCategory } from '@/types/product';
import {
  ShoppingBag,
  Sparkles,
  Home,
  Smartphone,
  Microwave,
  Dumbbell,
  Baby,
  PawPrint,
  Briefcase
} from 'lucide-react';

interface CategoryCardProps {
  category: ProductCategory;
}

const ICONS: Record<ProductCategory, any> = {
  beleza: Sparkles,
  casa: Home,
  eletronicos: Smartphone,
  eletrodomesticos: Microwave,
  escritorio: Briefcase,
  infantil: Baby,
  moda: ShoppingBag,
  pets: PawPrint,
  suplementos: Dumbbell,
};

export function CategoryCard({ category }: CategoryCardProps) {
  const Icon = ICONS[category];

  return (
    <Link to={`/category/${category}`} className="group block animate-fade-in">
      <div className="bg-white rounded-2xl p-5 shadow-md border border-gray-100 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-gray-200 text-center">

        {/* Ícone */}
        <div className="mb-3 flex items-center justify-center">
          <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center">
            <Icon size={26} strokeWidth={1.8} />
          </div>
        </div>

        {/* Nome da categoria */}
        <h3 className="font-semibold text-sm text-gray-800 leading-tight h-10 flex items-center justify-center px-1 text-center">
          {CATEGORY_LABELS[category]}
        </h3>

      </div>
    </Link>
  );
}
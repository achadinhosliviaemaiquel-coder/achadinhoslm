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
    <Link
      to={`/category/${category}`}
      className="group block animate-fade-in"
    >
      <div className="
        bg-white
        rounded-2xl
        px-3 py-4                 /* ↓ menos padding horizontal */
        shadow-sm
        border border-gray-100
        transition-all duration-300
        hover:shadow-md
        hover:-translate-y-0.5
        active:scale-[0.98]       /* feedback toque mobile */
        text-center
        h-[115px]                 /* altura consistente */
        flex flex-col
        items-center
        justify-center
      ">

        {/* Ícone */}
        <div className="mb-2 flex items-center justify-center">
          <div className="
            w-11 h-11              /* ↓ menor que antes */
            rounded-xl
            bg-gray-100
            flex items-center justify-center
            group-hover:bg-gray-200
            transition-colors
          ">
            <Icon size={22} strokeWidth={1.8} />
          </div>
        </div>

        {/* Nome */}
        <h3 className="
          font-semibold
          text-[13px]              /* ↓ melhor para 3 colunas */
          text-gray-800
          leading-tight
          text-center
          line-clamp-2
        ">
          {CATEGORY_LABELS[category]}
        </h3>

      </div>
    </Link>
  );
}

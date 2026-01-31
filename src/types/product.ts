export type ProductCategory =
  | "moda"
  | "beleza"
  | "casa"
  | "eletronicos"
  | "eletrodomesticos"
  | "suplementos"
  | "infantil"
  | "pets"
  | "escritorio";

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: ProductCategory;
  subcategory: string | null;
  description: string | null;
  benefits: string[];
  price_label: string;
  urgency_label: string | null;
  image_urls: string[];
  shopee_link: string | null;
  mercadolivre_link: string | null;
  amazon_link: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AffiliateLink {
  store: "shopee" | "mercadolivre" | "amazon";
  url: string;
  label: string;
}

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  moda: "Moda",
  beleza: "Beleza",
  casa: "Casa",
  eletronicos: "Eletrônicos",
  eletrodomesticos: "Eletrodomésticos",
  suplementos: "Suplementos",
  infantil: "Infantil",
  pets: "Pets",
  escritorio: "Escritório",
};

export const CATEGORY_ICONS: Record<ProductCategory, string> = {
  beleza: "✨",
  casa: "🏠",
  eletronicos: "📱",
  eletrodomesticos: "🍳",
  escritorio: "💼",
  infantil: "🧸",
  moda: "🛍️",
  pets: "🐾",
  suplementos: "💊",
};

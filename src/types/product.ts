// ⚠️ AGORA É SÓ PARA LABELS / UI, NÃO VEM MAIS DO BANCO
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

/* ================================
   CATEGORY (FK TABLE)
================================ */
export interface Category {
  id: string;
  slug: string;
  name: string;
}

/* ================================
   PRODUCT
================================ */
export interface Product {
  id: string;
  name: string;
  slug: string;

  // 🔁 NOVO MODELO RELACIONAL
  categories: Category; // ← vem do JOIN

  // ⚠️ legado (ENUM antigo) — manter temporário
  category?: ProductCategory;

  subcategory: string | null;
  description: string | null;
  benefits: string[];

  price_label: string;
  urgency_label: string | null;
  image_urls: string[];

  review_url?: string | null;
  brand_slug?: string | null;

  shopee_link: string | null;
  mercadolivre_link: string | null;
  amazon_link: string | null;

  shopee_price?: number | null;
  mercadolivre_price?: number | null;
  amazon_price?: number | null;

  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/* ================================
   AFFILIATE LINK
================================ */
export interface AffiliateLink {
  store: "shopee" | "mercadolivre" | "amazon";
  url: string;
  label: string;
}

/* ================================
   UI LABELS
================================ */

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

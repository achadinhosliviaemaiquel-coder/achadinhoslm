import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type FeaturedProduct = {
  id: string;
  name: string;
  slug: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  benefits: string[];
  price_label: string;
  urgency_label: string | null;
  image_urls: string[];
  shopee_link: string | null;
  mercadolivre_link: string | null;
  amazon_link: string | null;
  shopee_price: number | null;
  mercadolivre_price: number | null;
  amazon_price: number | null;
  brand_slug: string | null;
  review_url: string | null;
  outbounds_7d: number;
  views_7d: number;
};

export function useFeaturedProducts(limit = 6) {
  return useQuery({
    queryKey: ["featured-products", limit],
    queryFn: async (): Promise<FeaturedProduct[]> => {
      // Q32: get_featured_products retorna IDs rankeados por outbounds
      const { data: ranked, error: rankErr } = await supabase
        .rpc("get_featured_products", { p_limit: limit });

      if (rankErr) throw rankErr;
      if (!ranked || ranked.length === 0) return [];

      const ids = ranked.map((r: any) => r.product_id as string);

      const { data: products, error: prodErr } = await supabase
        .from("products")
        .select(
          "id, name, slug, category, subcategory, description, benefits, price_label, urgency_label, image_urls, shopee_link, mercadolivre_link, amazon_link, shopee_price, mercadolivre_price, amazon_price, brand_slug, review_url"
        )
        .in("id", ids)
        .eq("is_active", true);

      if (prodErr) throw prodErr;

      const rankMap = new Map(ranked.map((r: any) => [r.product_id, r]));

      return (products ?? [])
        .map((p) => {
          const rank: any = rankMap.get(p.id) ?? {};
          return {
            ...p,
            outbounds_7d: Number(rank.outbounds_7d ?? 0),
            views_7d: Number(rank.views_7d ?? 0),
          };
        })
        .sort((a, b) => b.outbounds_7d - a.outbounds_7d);
    },
    staleTime: 1000 * 60 * 10,  // Q32: 10 minutos de cache
    gcTime: 1000 * 60 * 30,
  });
}
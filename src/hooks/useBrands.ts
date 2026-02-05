import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";

export type BrandWithCount = {
  slug: string;
  name: string;
  product_count: number;
};

export function useBrands(categorySlug: string) {
  return useQuery({
    queryKey: ["brands", categorySlug],
    enabled: !!categorySlug,
    queryFn: async (): Promise<BrandWithCount[]> => {
      const supabase = getSupabase();

      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("brand_slug")
        .eq("is_active", true)
        .eq("category", categorySlug);

      if (productsError) throw productsError;

      const slugs = (products ?? [])
        .map((p) => p.brand_slug)
        .filter((s): s is string => typeof s === "string" && s.length > 0);

      if (slugs.length === 0) return [];

      const counts = new Map<string, number>();
      for (const s of slugs) counts.set(s, (counts.get(s) ?? 0) + 1);

      const uniqueSlugs = Array.from(counts.keys());

      const { data: brands, error: brandsError } = await supabase
        .from("brands")
        .select("slug, name")
        .in("slug", uniqueSlugs);

      if (brandsError) throw brandsError;

      return (brands ?? [])
        .map((b) => ({
          slug: b.slug as string,
          name: b.name as string,
          product_count: counts.get(b.slug as string) ?? 0,
        }))
        .filter((b) => b.product_count > 0)
        .filter((b) => b.slug !== "generico" && !b.slug.startsWith("generica-"))
        .sort((a, b) => b.product_count - a.product_count);
    },
    staleTime: 1000 * 60 * 10,
  });
}

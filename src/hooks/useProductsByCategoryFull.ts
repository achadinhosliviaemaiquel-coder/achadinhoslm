import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";

export function useProductsByCategoryFull(categorySlug: string) {
  return useQuery({
    queryKey: ["products-by-category-full", categorySlug],
    enabled: !!categorySlug,
    queryFn: async (): Promise<Product[]> => {
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true)
        .eq("category", categorySlug)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Product[];
    },
    staleTime: 1000 * 60 * 5,
  });
}

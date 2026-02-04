import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";

export function useProductsByCategoryFull(categorySlug: string) {
  return useQuery({
    queryKey: ["products-category-full", categorySlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          *,
          categories!inner (
            id,
            slug,
            name
          )
        `)
        .eq("is_active", true)
        .eq("categories.slug", categorySlug)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as Product[];
    },
  });
}

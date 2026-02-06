import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

export function useProductClicks(productId?: string) {
  return useQuery({
    queryKey: ["product-clicks", productId],
    enabled: !!productId,
    queryFn: async () => {
      const supabase = getSupabase()
      const { data, error } = await supabase.rpc("get_product_click_counts", {
        p_product_id: productId,
      })
      if (error) throw error

      const row = Array.isArray(data) ? data[0] : data
      return {
        clicks24h: Number(row?.clicks_24h ?? 0),
        clicks7d: Number(row?.clicks_7d ?? 0),
      }
    },
    staleTime: 30_000,
  })
}

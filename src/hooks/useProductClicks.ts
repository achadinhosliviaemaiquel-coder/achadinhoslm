import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

export function useProductClicks(productId?: string) {
  return useQuery({
    queryKey: ["product-clicks", productId],
    enabled: !!productId,
    queryFn: async () => {
      const supabase = getSupabase()

      const [clicksRes, outRes] = await Promise.all([
        supabase.rpc("get_product_click_counts", { p_product_id: productId }),
        supabase.rpc("get_product_outbound_counts", { p_product_id: productId }),
      ])

      if (clicksRes.error) throw clicksRes.error
      if (outRes.error) throw outRes.error

      const clicksRow = Array.isArray(clicksRes.data) ? clicksRes.data[0] : clicksRes.data
      const outRow = Array.isArray(outRes.data) ? outRes.data[0] : outRes.data

      const clicks24h = Number(clicksRow?.clicks_24h ?? 0)
      const clicks7d = Number(clicksRow?.clicks_7d ?? 0)
      const outbounds24h = Number(outRow?.outbounds_24h ?? 0)
      const outbounds7d = Number(outRow?.outbounds_7d ?? 0)

      return {
        clicks24h,
        clicks7d,
        outbounds24h,
        outbounds7d,
        efficiency24h: clicks24h > 0 ? outbounds24h / clicks24h : 0,
        efficiency7d: clicks7d > 0 ? outbounds7d / clicks7d : 0,
      }
    },
    staleTime: 30_000,
  })
}

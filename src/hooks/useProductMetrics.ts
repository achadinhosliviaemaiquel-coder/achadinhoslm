import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function useProductMetrics(productId?: string) {
  return useQuery({
    queryKey: ["product-metrics", productId],
    enabled: !!productId,
    queryFn: async () => {
      if (!productId) {
        return {
          viewsTotal: 0,
          views24h: 0,
          views7d: 0,
          outbounds24h: 0,
          outbounds7d: 0,
          efficiency24h: 0,
          efficiency7d: 0,
        }
      }

      const supabase = getSupabase()
      const { data, error } = await supabase.rpc("get_product_metrics", {
        p_product_id: productId,
      })
      if (error) throw error

      const row = Array.isArray(data) ? data[0] : data

      const viewsTotal = toNumber(row?.views_total)
      const views24h = toNumber(row?.views_24h)
      const views7d = toNumber(row?.views_7d)
      const out24h = toNumber(row?.outbounds_24h)
      const out7d = toNumber(row?.outbounds_7d)

      // ✅ preferir o que vem do SQL (já é % e arredondado)
      const efficiency24h = toNumber(row?.efficiency_24h)
      const efficiency7d = toNumber(row?.efficiency_7d)

      return {
        viewsTotal,
        views24h,
        views7d,
        outbounds24h: out24h,
        outbounds7d: out7d,
        efficiency24h, // % (0–100)
        efficiency7d,  // % (0–100)
      }
    },
    staleTime: 30_000,
  })
}

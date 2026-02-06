import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

type Period = "24h" | "7d"
type Kind = "intent" | "outbound"

export function useAdminClicksDashboard(period: Period) {
  return useQuery({
    queryKey: ["admin-clicks-dashboard", period],
    queryFn: async () => {
      const supabase = getSupabase()
      const since = period === "24h" ? "24 hours" : "7 days"

      const [intentTop, outboundTop, intentByStore, outboundByStore] = await Promise.all([
        supabase.rpc("get_top_clicked_products", { p_since: since, p_limit: 20, p_kind: "intent" as Kind }),
        supabase.rpc("get_top_clicked_products", { p_since: since, p_limit: 20, p_kind: "outbound" as Kind }),
        supabase.rpc("get_clicks_by_store", { p_since: since, p_kind: "intent" as Kind }),
        supabase.rpc("get_clicks_by_store", { p_since: since, p_kind: "outbound" as Kind }),
      ])

      if (intentTop.error) throw intentTop.error
      if (outboundTop.error) throw outboundTop.error
      if (intentByStore.error) throw intentByStore.error
      if (outboundByStore.error) throw outboundByStore.error

      return {
        intent: {
          top: (intentTop.data ?? []) as Array<{ product_id: string; clicks: number }>,
          byStore: (intentByStore.data ?? []) as Array<{ store: string; clicks: number }>,
        },
        outbound: {
          top: (outboundTop.data ?? []) as Array<{ product_id: string; clicks: number }>,
          byStore: (outboundByStore.data ?? []) as Array<{ store: string; clicks: number }>,
        },
      }
    },
    staleTime: 30_000,
  })
}

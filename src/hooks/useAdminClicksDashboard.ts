import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import type { Traffic } from "@/components/admin/ClicksDashboard"

type Period = "24h" | "7d"
type Kind = "intent" | "outbound"

type TopRow = { product_id: string; clicks: number }
type ByStoreRow = { store: string; clicks: number }

function trafficToParam(traffic: Traffic) {
  return traffic === "all" ? null : traffic
}

function intervalForPeriod(period: Period): string {
  // Postgres consegue fazer cast de text -> interval (ex: '24 hours', '7 days')
  return period === "24h" ? "24 hours" : "7 days"
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export function useAdminClicksDashboard(period: Period, traffic: Traffic = "all") {
  return useQuery({
    queryKey: ["admin-clicks-dashboard", period, traffic],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const supabase = getSupabase()

      const p_since = intervalForPeriod(period) as any // será coerção para interval do lado do Postgres
      const p_traffic = trafficToParam(traffic)

      const [intentTop, outboundTop, intentByStore, outboundByStore] = await Promise.all([
        supabase.rpc("get_top_clicked_products", {
          p_since,
          p_limit: 20,
          p_kind: "intent" as Kind,
          p_traffic,
        }),
        supabase.rpc("get_top_clicked_products", {
          p_since,
          p_limit: 20,
          p_kind: "outbound" as Kind,
          p_traffic,
        }),
        supabase.rpc("get_clicks_by_store", {
          p_since,
          p_kind: "intent" as Kind,
          p_traffic,
        }),
        supabase.rpc("get_clicks_by_store", {
          p_since,
          p_kind: "outbound" as Kind,
          p_traffic,
        }),
      ])

      if (intentTop.error) throw intentTop.error
      if (outboundTop.error) throw outboundTop.error
      if (intentByStore.error) throw intentByStore.error
      if (outboundByStore.error) throw outboundByStore.error

      const normTop = (rows: any[]): TopRow[] =>
        (Array.isArray(rows) ? rows : []).map((r) => ({
          product_id: String(r.product_id),
          clicks: toNumber(r.clicks),
        }))

      const normByStore = (rows: any[]): ByStoreRow[] =>
        (Array.isArray(rows) ? rows : []).map((r) => ({
          store: String(r.store),
          clicks: toNumber(r.clicks),
        }))

      return {
        intent: {
          top: normTop(intentTop.data as any),
          byStore: normByStore(intentByStore.data as any),
        },
        outbound: {
          top: normTop(outboundTop.data as any),
          byStore: normByStore(outboundByStore.data as any),
        },
      }
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

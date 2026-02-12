import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import type { Traffic } from "@/components/admin/ClicksDashboard"

export type AdminProductMetricsRow = {
  product_id: string
  slug: string
  name: string
  category: string
  is_active: boolean

  views_24h: number
  views_7d: number
  outbounds_24h: number
  outbounds_7d: number

  efficiency_24h: number // %
  efficiency_7d: number // %

  alert_low_outbound_7d: boolean
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

function toBool(v: unknown): boolean {
  if (typeof v === "boolean") return v
  if (typeof v === "string") return v === "true"
  return false
}

function trafficToParam(traffic: Traffic) {
  return traffic === "all" ? null : traffic
}

export function useAdminProductMetrics(params?: {
  minViews7d?: number
  limit?: number
  alertEfficiency7dBelow?: number // %
  traffic?: Traffic
}) {
  const minViews7d = params?.minViews7d ?? 50
  const limit = params?.limit ?? 400
  const alertEfficiency7dBelow = params?.alertEfficiency7dBelow ?? 2.0
  const traffic = params?.traffic ?? "all"

  return useQuery({
    queryKey: ["admin-products-metrics", minViews7d, limit, alertEfficiency7dBelow, traffic],
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<AdminProductMetricsRow[]> => {
      const supabase = getSupabase()
      const { data, error } = await supabase.rpc("get_products_metrics_admin", {
        p_min_views_7d: minViews7d,
        p_limit: limit,
        p_alert_efficiency_7d_below: alertEfficiency7dBelow,
        p_traffic: trafficToParam(traffic),
      })
      if (error) throw error

      const rows = Array.isArray(data) ? data : []
      return rows.map((r: any) => ({
        product_id: r.product_id,
        slug: r.slug,
        name: r.name,
        category: r.category,
        is_active: toBool(r.is_active),

        views_24h: toNumber(r.views_24h),
        views_7d: toNumber(r.views_7d),
        outbounds_24h: toNumber(r.outbounds_24h),
        outbounds_7d: toNumber(r.outbounds_7d),

        efficiency_24h: toNumber(r.efficiency_24h),
        efficiency_7d: toNumber(r.efficiency_7d),

        alert_low_outbound_7d: toBool(r.alert_low_outbound_7d),
      }))
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  })
}

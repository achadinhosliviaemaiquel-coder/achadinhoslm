import { useMemo, useState } from "react"
import { useAdminClicksDashboard } from "@/hooks/useAdminClicksDashboard"
import { useAdminProductMetrics } from "@/hooks/useAdminProductMetrics"
import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Info } from "lucide-react"
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product"

function storeLabel(store: string) {
  return store === "mercadolivre" ? "Mercado Livre" : store === "amazon" ? "Amazon" : "Shopee"
}

function platformLabel(p: Platform) {
  if (p === "all") return "Todas"
  if (p === "tiktok") return "TikTok"
  if (p === "instagram") return "Instagram"
  if (p === "facebook") return "Facebook"
  if (p === "google") return "Google"
  return "Unknown"
}

function copyToClipboard(text: string) {
  try {
    void navigator.clipboard.writeText(text)
  } catch {
    const ta = document.createElement("textarea")
    ta.value = text
    document.body.appendChild(ta)
    ta.select()
    document.execCommand("copy")
    document.body.removeChild(ta)
  }
}

type Mode = "funnel" | "performance"
type Period = "24h" | "7d"
type VolumeMetric = "outbounds" | "views"

export type Traffic = "all" | "organic" | "ads"

// ✅ novo filtro
export type Platform = "all" | "tiktok" | "instagram" | "facebook" | "google" | "unknown"

type Props = {
  traffic?: Traffic
}

function trafficToLabel(traffic: Traffic) {
  return traffic === "all" ? "All" : traffic === "organic" ? "Orgânico" : "Ads"
}

function periodToIntervalText(period: Period) {
  return period === "24h" ? "24 hours" : "7 days"
}

export default function ClicksDashboard({ traffic = "all" }: Props) {
  const [mode, setMode] = useState<Mode>("performance")
  const [period, setPeriod] = useState<Period>("7d")

  const [platform, setPlatform] = useState<Platform>("all")

  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all")
  const [minViews7d, setMinViews7d] = useState(50)
  const [alertBelow, setAlertBelow] = useState(2.0)

  const [volumeMetric, setVolumeMetric] = useState<VolumeMetric>("outbounds")

  const trafficLabel = trafficToLabel(traffic)
  const platformChipLabel = platformLabel(platform)

  // =========================
  // PLATFORM BREAKDOWN (best-effort)
  // =========================
  const platformBreakdownQuery = useQuery({
    queryKey: ["admin-platform-breakdown", period, traffic],
    queryFn: async () => {
      const supabase = getSupabase()
      const p_since_text = periodToIntervalText(period)
      const p_traffic = traffic === "all" ? null : traffic

      // ✅ RPC opcional: se não existir ainda, não quebra a tela.
      const { data, error } = await supabase.rpc("get_outbounds_by_platform_text", {
        p_since_text,
        p_traffic,
        p_platform: null,
      })

      if (error) {
        // fallback: sem breakdown (UI continua)
        return [] as Array<{ platform: string; outbounds: number }>
      }

      const rows = Array.isArray(data) ? data : []
      return rows.map((r: any) => ({
        platform: String(r.platform ?? ""),
        outbounds: Number(r.outbounds ?? 0),
      }))
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 0,
  })

  const platformCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of platformBreakdownQuery.data ?? []) {
      map.set(String(r.platform), Number(r.outbounds) || 0)
    }
    return map
  }, [platformBreakdownQuery.data])

  const selectedPlatformParam = platform === "all" ? null : platform

  // =========================
  // 1) FUNIL (CTA -> /go)
  // =========================
  // ✅ agora passa platform também (ajuste o hook useAdminClicksDashboard)
  const funnelQuery = useAdminClicksDashboard(period, traffic, platform)

  const funnelProductIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of funnelQuery.data?.intent.top ?? []) ids.add(r.product_id)
    for (const r of funnelQuery.data?.outbound.top ?? []) ids.add(r.product_id)
    return Array.from(ids)
  }, [funnelQuery.data?.intent.top, funnelQuery.data?.outbound.top])

  const { data: productsMap } = useQuery({
    queryKey: ["admin-clicks-products", funnelProductIds.join(",")],
    enabled: funnelProductIds.length > 0 && mode === "funnel",
    queryFn: async () => {
      const supabase = getSupabase()
      const { data, error } = await supabase.from("products").select("id,name,slug,category").in("id", funnelProductIds)
      if (error) throw error

      const map = new Map<string, { name: string; slug: string; category: string }>()
      for (const p of data ?? []) {
        map.set(p.id, { name: p.name, slug: p.slug, category: (p as any).category })
      }
      return map
    },
    staleTime: 60_000,
  })

  const intentTotal = useMemo(
    () => (funnelQuery.data?.intent.byStore ?? []).reduce((a, b) => a + Number(b.clicks), 0),
    [funnelQuery.data?.intent.byStore]
  )
  const outboundTotal = useMemo(
    () => (funnelQuery.data?.outbound.byStore ?? []).reduce((a, b) => a + Number(b.clicks), 0),
    [funnelQuery.data?.outbound.byStore]
  )

  const funnelEfficiency = intentTotal > 0 ? Math.round((outboundTotal / intentTotal) * 100) : 0

  // =========================
  // 2) PERFORMANCE (Views -> Outbound)
  // =========================
  const perfQuery = useAdminProductMetrics({
    minViews7d,
    limit: 400,
    alertEfficiency7dBelow: alertBelow,
    traffic,
    platform, // ✅ novo
  })

  const perfRowsFiltered = useMemo(() => {
    const rows = perfQuery.data ?? []
    const byCategory = activeCategory === "all" ? rows : rows.filter((r) => r.category === activeCategory)
    return byCategory
  }, [perfQuery.data, activeCategory])

  const windowViews = useMemo(() => {
    const rows = perfRowsFiltered
    if (period === "24h") return rows.reduce((sum, r) => sum + (r.views_24h ?? 0), 0)
    return rows.reduce((sum, r) => sum + (r.views_7d ?? 0), 0)
  }, [perfRowsFiltered, period])

  const windowOutbounds = useMemo(() => {
    const rows = perfRowsFiltered
    if (period === "24h") return rows.reduce((sum, r) => sum + (r.outbounds_24h ?? 0), 0)
    return rows.reduce((sum, r) => sum + (r.outbounds_7d ?? 0), 0)
  }, [perfRowsFiltered, period])

  const windowEfficiency = useMemo(() => {
    if (windowViews <= 0) return 0
    return Math.round(((windowOutbounds / windowViews) * 100) * 10) / 10
  }, [windowViews, windowOutbounds])

  const topEfficiency = useMemo(() => {
    const rows = perfRowsFiltered.slice()
    const minViewsWindow = period === "24h" ? 10 : minViews7d
    const filtered = rows.filter((r) => {
      const v = period === "24h" ? r.views_24h : r.views_7d
      return (v ?? 0) >= minViewsWindow
    })

    filtered.sort((a, b) => {
      const ea = period === "24h" ? a.efficiency_24h : a.efficiency_7d
      const eb = period === "24h" ? b.efficiency_24h : b.efficiency_7d
      return (eb ?? 0) - (ea ?? 0)
    })

    return filtered.slice(0, 15)
  }, [perfRowsFiltered, period, minViews7d])

  const getVolumeValue = (row: any) => {
    if (volumeMetric === "views") {
      return period === "24h" ? (row.views_24h ?? 0) : (row.views_7d ?? 0)
    }
    return period === "24h" ? (row.outbounds_24h ?? 0) : (row.outbounds_7d ?? 0)
  }

  const topVolume = useMemo(() => {
    const rows = perfRowsFiltered.slice()

    rows.sort((a, b) => {
      const vb = getVolumeValue(b)
      const va = getVolumeValue(a)
      if (vb !== va) return vb - va

      const ob = period === "24h" ? (b.outbounds_24h ?? 0) : (b.outbounds_7d ?? 0)
      const oa = period === "24h" ? (a.outbounds_24h ?? 0) : (a.outbounds_7d ?? 0)
      if (ob !== oa) return ob - oa

      const vvb = period === "24h" ? (b.views_24h ?? 0) : (b.views_7d ?? 0)
      const vva = period === "24h" ? (a.views_24h ?? 0) : (a.views_7d ?? 0)
      if (vvb !== vva) return vvb - vva

      return (a.name ?? "").localeCompare(b.name ?? "")
    })

    return rows.slice(0, 15)
  }, [perfRowsFiltered, period, volumeMetric])

  const alerts = useMemo(() => {
    const rows = perfRowsFiltered.slice()

    if (period === "24h") {
      return rows
        .filter((r) => (r.views_24h ?? 0) >= 30)
        .filter((r) => (r.efficiency_24h ?? 0) < alertBelow)
        .sort((a, b) => (b.views_24h ?? 0) - (a.views_24h ?? 0))
        .slice(0, 30)
    }

    return rows
      .filter((r) => r.alert_low_outbound_7d)
      .sort((a, b) => (b.views_7d ?? 0) - (a.views_7d ?? 0))
      .slice(0, 30)
  }, [perfRowsFiltered, period, alertBelow])

  const isLoading = mode === "funnel" ? funnelQuery.isLoading : perfQuery.isLoading
  const hasError = mode === "funnel" ? funnelQuery.error : perfQuery.error

  return (
    <div className="space-y-6">
      {/* Header + toggles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{mode === "funnel" ? "Cliques de compra (Funil)" : "Performance por Produto"}</h2>
          <p className="text-sm text-muted-foreground">
            {mode === "funnel"
              ? "Intenção (CTA) vs Saída real (/go) — diagnose fricção técnica e drops."
              : "Views na ProductPage vs cliques reais de compra (/go) — priorize CRO e mix de produtos."}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Tráfego: {trafficLabel}</Badge>
            <Badge variant="secondary">Plataforma: {platformChipLabel}</Badge>

            {mode === "performance" && (
              <Badge variant="outline">Janela: {period} • Eficiência: {windowEfficiency}%</Badge>
            )}
            {mode === "funnel" && (
              <Badge variant="outline">Janela: {period} • Eficiência: {funnelEfficiency}%</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant={mode === "performance" ? "default" : "outline"} onClick={() => setMode("performance")}>
            Performance
          </Button>
          <Button size="sm" variant={mode === "funnel" ? "default" : "outline"} onClick={() => setMode("funnel")}>
            Funil
          </Button>

          <div className="w-px bg-border mx-1 hidden sm:block" />

          <Button size="sm" variant={period === "24h" ? "default" : "outline"} onClick={() => setPeriod("24h")}>
            24h
          </Button>
          <Button size="sm" variant={period === "7d" ? "default" : "outline"} onClick={() => setPeriod("7d")}>
            7d
          </Button>
        </div>
      </div>

      {/* ✅ Plataforma pills */}
      <div className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={platform === "all" ? "default" : "outline"} onClick={() => setPlatform("all")}>
            Todas
            {platformCounts.size > 0 && <span className="ml-2 opacity-70">({Array.from(platformCounts.values()).reduce((a, b) => a + b, 0)})</span>}
          </Button>

          <Button size="sm" variant={platform === "tiktok" ? "default" : "outline"} onClick={() => setPlatform("tiktok")}>
            TikTok
            {platformCounts.size > 0 && <span className="ml-2 opacity-70">({platformCounts.get("tiktok") ?? 0})</span>}
          </Button>

          <Button size="sm" variant={platform === "instagram" ? "default" : "outline"} onClick={() => setPlatform("instagram")}>
            Instagram
            {platformCounts.size > 0 && <span className="ml-2 opacity-70">({platformCounts.get("instagram") ?? 0})</span>}
          </Button>

          <Button size="sm" variant={platform === "facebook" ? "default" : "outline"} onClick={() => setPlatform("facebook")}>
            Facebook
            {platformCounts.size > 0 && <span className="ml-2 opacity-70">({platformCounts.get("facebook") ?? 0})</span>}
          </Button>

          <Button size="sm" variant={platform === "google" ? "default" : "outline"} onClick={() => setPlatform("google")}>
            Google
            {platformCounts.size > 0 && <span className="ml-2 opacity-70">({platformCounts.get("google") ?? 0})</span>}
          </Button>

          <Button size="sm" variant={platform === "unknown" ? "default" : "outline"} onClick={() => setPlatform("unknown")}>
            Unknown
            {platformCounts.size > 0 && <span className="ml-2 opacity-70">({platformCounts.get("unknown") ?? 0})</span>}
          </Button>

          {platformBreakdownQuery.isFetching && <span className="text-xs text-muted-foreground ml-2">atualizando…</span>}
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Filtro de plataforma</AlertTitle>
          <AlertDescription>
            Este filtro tenta identificar a origem (TikTok/Instagram/Facebook/Google) via <code>utm_source</code>,{" "}
            <code>fbclid/ttclid/gclid</code> e/ou <code>referer</code>. Se a RPC ainda não estiver criada, a UI continua funcionando.
          </AlertDescription>
        </Alert>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {hasError && <div className="text-sm text-destructive">Erro ao carregar dados.</div>}

      {/* =========================
          PERFORMANCE
         ========================= */}
      {mode === "performance" && perfQuery.data && (
        <>
          {/* Filtros */}
          <div className="flex flex-col gap-3 rounded-2xl border border-black/10 p-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={activeCategory === "all" ? "default" : "outline"} onClick={() => setActiveCategory("all")}>
                Todas categorias
              </Button>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={activeCategory === key ? "default" : "outline"}
                  onClick={() => setActiveCategory(key as ProductCategory)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Min views (7d):</span>
                <input
                  className="h-9 w-24 rounded-md border bg-background px-2"
                  type="number"
                  min={0}
                  value={minViews7d}
                  onChange={(e) => setMinViews7d(Math.max(0, Number(e.target.value || 0)))}
                />
              </label>

              <label className="flex items-center gap-2">
                <span className="text-muted-foreground">Alerta se eficiência &lt;</span>
                <input
                  className="h-9 w-24 rounded-md border bg-background px-2"
                  type="number"
                  min={0}
                  step={0.1}
                  value={alertBelow}
                  onChange={(e) => setAlertBelow(Math.max(0, Number(e.target.value || 0)))}
                />
                <span className="text-muted-foreground">%</span>
              </label>

              <Badge variant="secondary">
                Base: {activeCategory === "all" ? "todas" : CATEGORY_LABELS[activeCategory]} • {period} • {trafficLabel} •{" "}
                {platformChipLabel}
              </Badge>
            </div>
          </div>

          {/* KPIs da janela */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Views ({period})</div>
              <div className="text-2xl font-semibold">{windowViews}</div>
            </div>

            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Outbounds (/go) ({period})</div>
              <div className="text-2xl font-semibold">{windowOutbounds}</div>
            </div>

            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Eficiência (outbound / views)</div>
              <div className="text-2xl font-semibold">{windowEfficiency}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                Pode passar de 100% se houver outbounds “atrasados” (ex.: clique hoje em view de ontem) ou tráfego in-app/redirect.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* TOP EFICIÊNCIA */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Top eficiência — {period}</div>
                <Badge variant="secondary">outbounds / views</Badge>
              </div>

              <div className="space-y-2">
                {topEfficiency.length === 0 && (
                  <div className="text-sm text-muted-foreground">Sem produtos suficientes para ranquear nesta janela.</div>
                )}

                {topEfficiency.map((r, idx) => {
                  const eff = period === "24h" ? r.efficiency_24h : r.efficiency_7d
                  const v = period === "24h" ? r.views_24h : r.views_7d
                  const o = period === "24h" ? r.outbounds_24h : r.outbounds_7d
                  return (
                    <div
                      key={`eff-${r.product_id}`}
                      className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          #{idx + 1} {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.category}/{r.slug} • views: {v} • outbounds: {o}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">{Number(eff ?? 0).toFixed(2)}%</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* TOP VOLUME */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Top volume — {period}</div>
                <Badge variant="secondary">{volumeMetric === "views" ? "views" : "outbounds"}</Badge>
              </div>

              <div className="flex gap-2 mb-3">
                <Button size="sm" variant={volumeMetric === "outbounds" ? "default" : "outline"} onClick={() => setVolumeMetric("outbounds")}>
                  Outbounds
                </Button>
                <Button size="sm" variant={volumeMetric === "views" ? "default" : "outline"} onClick={() => setVolumeMetric("views")}>
                  Views
                </Button>
              </div>

              <div className="space-y-2">
                {topVolume.length === 0 && <div className="text-sm text-muted-foreground">Sem dados para esta janela/filtro.</div>}

                {topVolume.map((r, idx) => {
                  const v = period === "24h" ? r.views_24h : r.views_7d
                  const o = period === "24h" ? r.outbounds_24h : r.outbounds_7d
                  const eff = period === "24h" ? r.efficiency_24h : r.efficiency_7d
                  const vol = getVolumeValue(r)
                  return (
                    <div
                      key={`vol-${r.product_id}`}
                      className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          #{idx + 1} {r.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.category}/{r.slug} • views: {v} • outbounds: {o} • eff: {Number(eff ?? 0).toFixed(2)}%
                        </div>
                      </div>
                      <div className="text-sm font-semibold">{vol}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ALERTAS */}
            <div className="lg:col-span-12 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Alertas — eficiência &lt; {alertBelow}%</div>
                <Badge variant="secondary">priorizar CRO</Badge>
              </div>

              <div className="space-y-2">
                {alerts.length === 0 && <div className="text-sm text-muted-foreground">Nenhum alerta para os filtros atuais.</div>}

                {alerts.map((r) => {
                  const v = period === "24h" ? r.views_24h : r.views_7d
                  const o = period === "24h" ? r.outbounds_24h : r.outbounds_7d
                  const eff = period === "24h" ? r.efficiency_24h : r.efficiency_7d

                  return (
                    <div
                      key={`alert-${r.product_id}`}
                      className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{r.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.category}/{r.slug} • views: {v} • outbounds: {o}
                        </div>
                      </div>
                      <div className="text-sm font-semibold">{Number(eff ?? 0).toFixed(2)}%</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================
          FUNNEL
         ========================= */}
      {mode === "funnel" && funnelQuery.data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Intenção (cliques no CTA)</div>
              <div className="text-2xl font-semibold">{intentTotal}</div>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Saída real (redirecionamento)</div>
              <div className="text-2xl font-semibold">{outboundTotal}</div>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Eficiência (outbound / intent)</div>
              <div className="text-2xl font-semibold">{funnelEfficiency}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                Se cair muito, pode ser fricção no /go, link inválido, demora, bloqueio in-app, etc.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* TOP INTENT */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Top produtos — Intenção</div>
                <Badge variant="secondary">CTA</Badge>
              </div>

              <div className="space-y-2">
                {funnelQuery.data.intent.top.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nenhum clique registrado no período.</div>
                )}

                {funnelQuery.data.intent.top.map((row, idx) => {
                  const p = productsMap?.get(row.product_id)
                  return (
                    <div
                      key={`intent-${row.product_id}`}
                      className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          #{idx + 1} {p?.name ?? row.product_id}
                        </div>
                        {p?.slug && (
                          <div className="text-xs text-muted-foreground truncate">
                            {p.category}/{p.slug}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-semibold">{row.clicks}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* TOP OUTBOUND */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Top produtos — Saída real</div>
                <Badge variant="secondary">/go</Badge>
              </div>

              <div className="space-y-2">
                {funnelQuery.data.outbound.top.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nenhuma saída registrada no período.</div>
                )}

                {funnelQuery.data.outbound.top.map((row, idx) => {
                  const p = productsMap?.get(row.product_id)
                  return (
                    <div
                      key={`outbound-${row.product_id}`}
                      className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          #{idx + 1} {p?.name ?? row.product_id}
                        </div>
                        {p?.slug && (
                          <div className="text-xs text-muted-foreground truncate">
                            {p.category}/{p.slug}
                          </div>
                        )}
                      </div>
                      <div className="text-sm font-semibold">{row.clicks}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* POR LOJA INTENT */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Por loja — Intenção</div>
                <Badge variant="secondary">CTA</Badge>
              </div>

              <div className="space-y-2">
                {funnelQuery.data.intent.byStore.length === 0 && <div className="text-sm text-muted-foreground">Sem dados no período.</div>}
                {funnelQuery.data.intent.byStore.map((row) => (
                  <div key={`intent-store-${row.store}`} className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
                    <div className="text-sm">{storeLabel(row.store)}</div>
                    <div className="text-sm font-semibold">{row.clicks}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* POR LOJA OUTBOUND */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Por loja — Saída real</div>
                <Badge variant="secondary">/go</Badge>
              </div>

              <div className="space-y-2">
                {funnelQuery.data.outbound.byStore.length === 0 && <div className="text-sm text-muted-foreground">Sem dados no período.</div>}
                {funnelQuery.data.outbound.byStore.map((row) => (
                  <div
                    key={`outbound-store-${row.store}`}
                    className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2"
                  >
                    <div className="text-sm">{storeLabel(row.store)}</div>
                    <div className="text-sm font-semibold">{row.clicks}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

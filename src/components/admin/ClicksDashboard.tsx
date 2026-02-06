import { useMemo, useState } from "react"
import { useAdminClicksDashboard } from "@/hooks/useAdminClicksDashboard"
import { useAdminProductMetrics } from "@/hooks/useAdminProductMetrics"
import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product"

function storeLabel(store: string) {
  return store === "mercadolivre" ? "Mercado Livre" : store === "amazon" ? "Amazon" : "Shopee"
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

export default function ClicksDashboard() {
  const [mode, setMode] = useState<Mode>("performance")
  const [period, setPeriod] = useState<Period>("7d")

  // filtros Performance
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all")
  const [minViews7d, setMinViews7d] = useState(50)
  const [alertBelow, setAlertBelow] = useState(2.0) // %

  // toggle do "Top Volume"
  const [volumeMetric, setVolumeMetric] = useState<VolumeMetric>("outbounds")

  // =========================
  // 1) FUNIL (CTA -> /go)
  // =========================
  const funnelQuery = useAdminClicksDashboard(period)

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
      const { data, error } = await supabase
        .from("products")
        .select("id,name,slug,category")
        .in("id", funnelProductIds)

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

  // eficiência ponderada (não média simples)
  const windowEfficiency = useMemo(() => {
    if (windowViews <= 0) return 0
    return Math.round(((windowOutbounds / windowViews) * 100) * 10) / 10
  }, [windowViews, windowOutbounds])

  const topEfficiency = useMemo(() => {
    // para ranking, evita ruído: só considera rows com views suficientes na janela escolhida
    const rows = perfRowsFiltered.slice()

    const minViewsWindow = period === "24h" ? 10 : minViews7d // 24h é mais curto -> threshold menor
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

  // helper: pega métrica de "volume" e desempates coerentes
  const getVolumeValue = (row: any) => {
    if (volumeMetric === "views") {
      return period === "24h" ? (row.views_24h ?? 0) : (row.views_7d ?? 0)
    }
    return period === "24h" ? (row.outbounds_24h ?? 0) : (row.outbounds_7d ?? 0)
  }

  const topVolume = useMemo(() => {
    const rows = perfRowsFiltered.slice()

    rows.sort((a, b) => {
      // 1) ordena pela métrica escolhida (views ou outbounds)
      const vb = getVolumeValue(b)
      const va = getVolumeValue(a)
      if (vb !== va) return vb - va

      // 2) desempate sempre por OUT (se o volume for views, OUT ajuda a priorizar monetização)
      const ob = period === "24h" ? (b.outbounds_24h ?? 0) : (b.outbounds_7d ?? 0)
      const oa = period === "24h" ? (a.outbounds_24h ?? 0) : (a.outbounds_7d ?? 0)
      if (ob !== oa) return ob - oa

      // 3) desempate por VIEWS
      const vvb = period === "24h" ? (b.views_24h ?? 0) : (b.views_7d ?? 0)
      const vva = period === "24h" ? (a.views_24h ?? 0) : (a.views_7d ?? 0)
      if (vvb !== vva) return vvb - vva

      // 4) desempate final: nome (estável)
      return (a.name ?? "").localeCompare(b.name ?? "")
    })

    return rows.slice(0, 15)
  }, [perfRowsFiltered, period, volumeMetric]) // <- inclui volumeMetric

  const alerts = useMemo(() => {
    const rows = perfRowsFiltered.slice()

    if (period === "24h") {
      // regra equivalente para 24h (simples): views >= 30 e efficiency < alertBelow
      return rows
        .filter((r) => (r.views_24h ?? 0) >= 30)
        .filter((r) => (r.efficiency_24h ?? 0) < alertBelow)
        .sort((a, b) => (b.views_24h ?? 0) - (a.views_24h ?? 0))
        .slice(0, 30)
    }

    // 7d usa o boolean do banco (melhor)
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
          <h2 className="text-lg font-semibold">
            {mode === "funnel" ? "Cliques de compra (Funil)" : "Performance por Produto"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {mode === "funnel"
              ? "Intenção (CTA) vs Saída real (/go) — diagnose fricção técnica e drops."
              : "Views na ProductPage vs cliques reais de compra (/go) — priorize CRO e mix de produtos."}
          </p>
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
                Base: {activeCategory === "all" ? "todas" : CATEGORY_LABELS[activeCategory]} • {period}
              </Badge>
            </div>
          </div>

          {/* KPIs performance */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Views ({period})</div>
              <div className="text-2xl font-semibold">{windowViews}</div>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Cliques p/ comprar ({period})</div>
              <div className="text-2xl font-semibold">{windowOutbounds}</div>
            </div>
            <div className="rounded-2xl border border-black/10 p-4">
              <div className="text-sm text-muted-foreground">Eficiência ponderada ({period})</div>
              <div className="text-2xl font-semibold">{windowEfficiency}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                Eficiência = outbounds/views. Ponderada evita “enganos” com pouco tráfego.
              </div>
            </div>
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Top Eficiência */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Top produtos — Eficiência</div>
                <Badge variant="secondary">CRO</Badge>
              </div>

              <div className="space-y-2">
                {topEfficiency.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Sem produtos com volume suficiente para ranking (ajuste “min views”).
                  </div>
                )}

                {topEfficiency.map((row, idx) => {
                  const views = period === "24h" ? row.views_24h : row.views_7d
                  const out = period === "24h" ? row.outbounds_24h : row.outbounds_7d
                  const eff = period === "24h" ? row.efficiency_24h : row.efficiency_7d

                  return (
                    <div key={`eff-${row.product_id}`} className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          #{idx + 1} {row.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {row.category}/{row.slug}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Views: <span className="text-foreground font-medium">{views ?? 0}</span> • Out:{" "}
                          <span className="text-foreground font-medium">{out ?? 0}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold tabular-nums">{(eff ?? 0).toFixed(2)}%</div>
                        <Button asChild size="sm" variant="outline">
                          <a href={`/product/${row.slug}`} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Top Volume */}
            <div className="lg:col-span-6 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="font-semibold">Top produtos — Volume</div>

                <div className="flex items-center gap-2">
                  {/* toggle do ranking */}
                  <div className="flex rounded-lg border border-black/10 overflow-hidden">
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-[12px] ${volumeMetric === "outbounds" ? "bg-muted font-semibold" : "bg-background text-muted-foreground"}`}
                      onClick={() => setVolumeMetric("outbounds")}
                      title="Ordenar por cliques reais (/go)"
                    >
                      Out
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 text-[12px] ${volumeMetric === "views" ? "bg-muted font-semibold" : "bg-background text-muted-foreground"}`}
                      onClick={() => setVolumeMetric("views")}
                      title="Ordenar por views na ProductPage"
                    >
                      Views
                    </button>
                  </div>

                  <Badge variant="secondary">Escala</Badge>
                </div>
              </div>

              <div className="space-y-2">
                {topVolume.length === 0 && <div className="text-sm text-muted-foreground">Sem dados no período.</div>}

                {topVolume.map((row, idx) => {
                  const views = period === "24h" ? row.views_24h : row.views_7d
                  const out = period === "24h" ? row.outbounds_24h : row.outbounds_7d
                  const eff = period === "24h" ? row.efficiency_24h : row.efficiency_7d

                  return (
                    <div key={`vol-${row.product_id}`} className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          #{idx + 1} {row.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {row.category}/{row.slug}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-[11px] text-muted-foreground text-right">
                          <div>
                            Views: <span className="text-foreground font-semibold">{views ?? 0}</span>
                          </div>
                          <div>
                            Out: <span className="text-foreground font-semibold">{out ?? 0}</span>
                          </div>
                          <div>
                            Eff: <span className="text-foreground font-medium">{(eff ?? 0).toFixed(2)}%</span>
                          </div>
                        </div>
                        <Button asChild size="sm" variant="outline">
                          <a href={`/product/${row.slug}`} target="_blank" rel="noreferrer">
                            Abrir
                          </a>
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="text-xs text-muted-foreground mt-3">
                {volumeMetric === "outbounds"
                  ? "Ordenado por cliques reais (/go). Bom para descobrir o que monetiza."
                  : "Ordenado por views. Bom para descobrir o que está chamando atenção (topo do funil)."}
              </div>
            </div>

            {/* Alertas */}
            <div className="lg:col-span-12 rounded-2xl border border-black/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold">Alertas — Muito view, pouco clique</div>
                <Badge variant="secondary">Ação</Badge>
              </div>

              <div className="space-y-2">
                {alerts.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    Nenhum alerta no período. (Isso é bom.)
                  </div>
                )}

                {alerts.map((row) => {
                  const views = period === "24h" ? row.views_24h : row.views_7d
                  const out = period === "24h" ? row.outbounds_24h : row.outbounds_7d
                  const eff = period === "24h" ? row.efficiency_24h : row.efficiency_7d

                  return (
                    <div
                      key={`alert-${row.product_id}`}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-black/10 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{row.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {row.category}/{row.slug}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Views: <span className="text-foreground font-semibold">{views ?? 0}</span> • Out:{" "}
                          <span className="text-foreground font-semibold">{out ?? 0}</span> • Eff:{" "}
                          <span className="text-foreground font-semibold">{(eff ?? 0).toFixed(2)}%</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button asChild size="sm" variant="outline">
                          <a href={`/product/${row.slug}`} target="_blank" rel="noreferrer">
                            Ver página
                          </a>
                        </Button>

                        <Button size="sm" variant="secondary" onClick={() => copyToClipboard(row.slug)} title="Copiar slug">
                          Copiar slug
                        </Button>

                        <Button size="sm" variant="outline" onClick={() => copyToClipboard(row.product_id)} title="Copiar ID">
                          Copiar ID
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 text-xs text-muted-foreground leading-relaxed">
                Ações típicas: trocar primeira imagem, reescrever título (benefício claro), reduzir fricção no CTA,
                ajustar oferta primária (loja/ordem), adicionar review/prova social.
              </div>
            </div>
          </div>
        </>
      )}

      {/* =========================
          FUNNEL (original)
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
                    <div key={`intent-${row.product_id}`} className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
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
                    <div key={`outbound-${row.product_id}`} className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
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
                {funnelQuery.data.intent.byStore.length === 0 && (
                  <div className="text-sm text-muted-foreground">Sem dados no período.</div>
                )}
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
                {funnelQuery.data.outbound.byStore.length === 0 && (
                  <div className="text-sm text-muted-foreground">Sem dados no período.</div>
                )}
                {funnelQuery.data.outbound.byStore.map((row) => (
                  <div key={`outbound-store-${row.store}`} className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2">
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

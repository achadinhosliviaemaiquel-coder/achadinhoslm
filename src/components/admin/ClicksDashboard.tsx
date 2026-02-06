import { useMemo, useState } from "react"
import { useAdminClicksDashboard } from "@/hooks/useAdminClicksDashboard"
import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

function storeLabel(store: string) {
  return store === "mercadolivre" ? "Mercado Livre" : store === "amazon" ? "Amazon" : "Shopee"
}

export default function ClicksDashboard() {
  const [period, setPeriod] = useState<"24h" | "7d">("24h")
  const { data, isLoading, error } = useAdminClicksDashboard(period)

  const productIds = useMemo(() => {
    const ids = new Set<string>()
    for (const r of data?.intent.top ?? []) ids.add(r.product_id)
    for (const r of data?.outbound.top ?? []) ids.add(r.product_id)
    return Array.from(ids)
  }, [data?.intent.top, data?.outbound.top])

  const { data: productsMap } = useQuery({
    queryKey: ["admin-clicks-products", productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const supabase = getSupabase()
      const { data, error } = await supabase
        .from("products")
        .select("id,name,slug,category")
        .in("id", productIds)

      if (error) throw error

      const map = new Map<string, { name: string; slug: string; category: string }>()
      for (const p of data ?? []) {
        map.set(p.id, { name: p.name, slug: p.slug, category: (p as any).category })
      }
      return map
    },
    staleTime: 60_000,
  })

  const intentTotal = useMemo(() => (data?.intent.byStore ?? []).reduce((a, b) => a + Number(b.clicks), 0), [data?.intent.byStore])
  const outboundTotal = useMemo(() => (data?.outbound.byStore ?? []).reduce((a, b) => a + Number(b.clicks), 0), [data?.outbound.byStore])

  const efficiency = intentTotal > 0 ? Math.round((outboundTotal / intentTotal) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cliques de compra</h2>
          <p className="text-sm text-muted-foreground">
            Intenção (CTA) vs Saída real (/go)
          </p>
        </div>

        <div className="flex gap-2">
          <Button size="sm" variant={period === "24h" ? "default" : "outline"} onClick={() => setPeriod("24h")}>
            24h
          </Button>
          <Button size="sm" variant={period === "7d" ? "default" : "outline"} onClick={() => setPeriod("7d")}>
            7d
          </Button>
        </div>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {error && <div className="text-sm text-destructive">Erro ao carregar dados.</div>}

      {data && (
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
              <div className="text-2xl font-semibold">{efficiency}%</div>
              <div className="text-xs text-muted-foreground mt-1">
                Se cair muito, pode ser fricção no /go, link inválido, demora, bloqueio, etc.
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
                {data.intent.top.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nenhum clique registrado no período.</div>
                )}

                {data.intent.top.map((row, idx) => {
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
                {data.outbound.top.length === 0 && (
                  <div className="text-sm text-muted-foreground">Nenhuma saída registrada no período.</div>
                )}

                {data.outbound.top.map((row, idx) => {
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
                {data.intent.byStore.length === 0 && (
                  <div className="text-sm text-muted-foreground">Sem dados no período.</div>
                )}
                {data.intent.byStore.map((row) => (
                  <div
                    key={`intent-store-${row.store}`}
                    className="flex items-center justify-between rounded-xl border border-black/10 px-3 py-2"
                  >
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
                {data.outbound.byStore.length === 0 && (
                  <div className="text-sm text-muted-foreground">Sem dados no período.</div>
                )}
                {data.outbound.byStore.map((row) => (
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

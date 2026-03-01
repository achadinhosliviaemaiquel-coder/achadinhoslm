import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product"

type SubcategoryRow = {
  category: string
  subcategory: string
  count: number
}

async function fetchSubcategories(): Promise<SubcategoryRow[]> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from("products")
    .select("category, subcategory")
    .eq("is_active", true)
    .not("subcategory", "is", null)

  if (error) throw error

  // Group by category + subcategory and count
  const map = new Map<string, number>()
  for (const row of (data ?? []) as { category: string; subcategory: string }[]) {
    if (!row.subcategory) continue
    const key = `${row.category}|||${row.subcategory}`
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  return Array.from(map.entries())
    .map(([key, count]) => {
      const [category, subcategory] = key.split("|||")
      return { category, subcategory, count }
    })
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category)
      return b.count - a.count
    })
}

export default function AdminSubcategoriesPanel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin", "subcategories"],
    queryFn: fetchSubcategories,
  })

  // Group by category
  const grouped = (data ?? []).reduce<Record<string, SubcategoryRow[]>>((acc, row) => {
    if (!acc[row.category]) acc[row.category] = []
    acc[row.category].push(row)
    return acc
  }, {})

  const categories = Object.keys(grouped).sort((a, b) => {
    const la = CATEGORY_LABELS[a as ProductCategory] ?? a
    const lb = CATEGORY_LABELS[b as ProductCategory] ?? b
    return la.localeCompare(lb)
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Subcategorias em uso</CardTitle>
        <p className="text-sm text-muted-foreground">
          Subcategorias dos produtos ativos, agrupadas por categoria. Use estes valores ao cadastrar novos produtos.
        </p>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando subcategorias...
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Erro ao carregar subcategorias.</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma subcategoria cadastrada ainda.</p>
        ) : (
          <div className="space-y-6">
            {categories.map((cat) => (
              <div key={cat} className="space-y-2">
                <h3 className="text-sm font-semibold">
                  {CATEGORY_LABELS[cat as ProductCategory] ?? cat}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {grouped[cat].map((row) => (
                    <Badge key={row.subcategory} variant="secondary" className="gap-1">
                      <span>{row.subcategory}</span>
                      <span className="text-muted-foreground text-xs">({row.count})</span>
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

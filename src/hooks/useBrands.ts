import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

export type BrandWithCount = {
  slug: string
  name: string
  product_count: number
  logo_url?: string | null
}

export function useBrands(categorySlug: string) {
  return useQuery({
    queryKey: ["brands", categorySlug],
    enabled: !!categorySlug && categorySlug !== "all",
    queryFn: async (): Promise<BrandWithCount[]> => {
      const supabase = getSupabase()

      // 1) Busca todas as marcas da categoria (independente de ter produto)
      // ✅ inclui logo_url para permitir renderização de logo em outros pontos
      const { data: brands, error: brandsError } = await supabase
        .from("brands")
        .select("slug, name, logo_url, category")
        .eq("category", categorySlug)

      if (brandsError) throw brandsError

      const normalizedBrands =
        (brands ?? [])
          .map((b) => ({
            slug: b.slug as string,
            name: b.name as string,
            logo_url: (b as any).logo_url ?? null,
          }))
          // mantém sua regra de filtro
          .filter((b) => b.slug !== "generico" && !b.slug.startsWith("generica-"))

      // 2) Calcula contagem de produtos ativos por brand_slug (para ordenar / mostrar força)
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("brand_slug")
        .eq("is_active", true)
        .eq("category", categorySlug)

      if (productsError) throw productsError

      const counts = new Map<string, number>()
      for (const p of products ?? []) {
        const s = (p as any).brand_slug
        if (typeof s === "string" && s.length > 0) counts.set(s, (counts.get(s) ?? 0) + 1)
      }

      // 3) Retorna todas as marcas da categoria, com product_count (0 se ainda não tem produto)
      // Ordena por product_count DESC, depois name ASC para estabilidade
      return normalizedBrands
        .map((b) => ({
          ...b,
          product_count: counts.get(b.slug) ?? 0,
        }))
        .sort((a, b) => {
          if (b.product_count !== a.product_count) return b.product_count - a.product_count
          return a.name.localeCompare(b.name)
        })
    },
    staleTime: 1000 * 60 * 2, // ✅ menor: atualização mais rápida após criar marca
  })
}

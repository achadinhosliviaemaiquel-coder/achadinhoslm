import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import type { Product } from "@/types/product"

export function useFeaturedProducts(limit = 6) {
  return useQuery({
    queryKey: ["featured-products", limit],
    queryFn: async (): Promise<Product[]> => {
      const supabase = getSupabase()

      // 1) Pega ranking por cliques reais (7d), com fallback por views (7d)
      const { data: ranking, error: rankingError } = await supabase.rpc("get_featured_products", {
        p_limit: limit,
      })

      if (rankingError) throw rankingError

      const productIds = (ranking ?? []).map((r: any) => r.product_id).filter(Boolean)
      if (productIds.length === 0) return []

      // 2) Busca os produtos completos
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("*")
        .in("id", productIds)

      if (productsError) throw productsError

      // 3) Reordena para manter a ordem do ranking (o IN não garante order)
      const byId = new Map<string, Product>()
      for (const p of products ?? []) byId.set((p as any).id, p as Product)

      return productIds.map((id: string) => byId.get(id)).filter(Boolean) as Product[]
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

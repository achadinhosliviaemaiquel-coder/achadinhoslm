import { supabase } from "@/integrations/supabase/client"
import { useQuery } from "@tanstack/react-query"

type Mode = "public" | "admin"

export function useBrands(category: string, mode: Mode = "public") {
  return useQuery({
    queryKey: ["brands", category, mode],
    queryFn: async () => {

      // 🔹 ADMIN MODE → só lista marcas da categoria
      if (mode === "admin") {
        const { data, error } = await supabase
          .from("brands")
          .select("id, name, slug")
          .eq("category", category)
          .order("name")

        if (error) throw error
        return data
      }

      // 🔹 PUBLIC MODE (o que você já usava)
      const { data: brands, error: brandError } = await supabase
        .from("brands")
        .select("id, name, slug, logo_url")
        .eq("category", category)
        .eq("is_featured", true)

      if (brandError) throw brandError
      if (!brands?.length) return []

      const { data: counts, error: countError } = await supabase
        .from("products")
        .select("brand_slug")
        .in("brand_slug", brands.map(b => b.slug))

      if (countError) throw countError

      const countMap: Record<string, number> = {}

      counts.forEach(p => {
        if (!p.brand_slug) return
        countMap[p.brand_slug] = (countMap[p.brand_slug] || 0) + 1
      })

      return brands
        .map(brand => ({
          ...brand,
          product_count: countMap[brand.slug] || 0
        }))
        .filter(brand => brand.product_count > 0)
        .sort((a, b) => b.product_count - a.product_count)
    },
  })
}
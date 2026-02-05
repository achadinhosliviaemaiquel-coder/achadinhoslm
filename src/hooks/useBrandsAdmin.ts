import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

export interface Brand {
  id: string
  name: string
  slug: string
  category: string
  is_featured: boolean
  created_at: string
}

/* ================= LIST ================= */

export function useBrandsAdmin() {
  return useQuery({
    queryKey: ["admin-brands"],
    queryFn: async () => {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from("brands")
        .select("*")
        .order("name")

      if (error) throw error
      return data as Brand[]
    },
  })
}

/* ================= CREATE ================= */

export function useCreateBrand() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (brand: Omit<Brand, "id" | "created_at">) => {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from("brands")
        .insert(brand)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-brands"] }),
  })
}

/* ================= UPDATE ================= */

export function useUpdateBrand() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Brand> & { id: string }) => {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from("brands")
        .update(updates)
        .eq("id", id)
        .select()
        .single()

      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-brands"] }),
  })
}

/* ================= DELETE ================= */

export function useDeleteBrand() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase()

      const { error } = await supabase.from("brands").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-brands"] }),
  })
}

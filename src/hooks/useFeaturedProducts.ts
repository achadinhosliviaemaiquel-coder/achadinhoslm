import { useQuery } from '@tanstack/react-query'
import { getSupabase } from '@/integrations/supabase/client'
import type { Product } from '@/types/product'

export function useFeaturedProducts() {
  return useQuery({
    queryKey: ['featured-products'],
    queryFn: async (): Promise<Product[]> => {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .order('views', { ascending: false })
        .limit(6)

      if (error) throw error
      return data as Product[]
    },
  })
}

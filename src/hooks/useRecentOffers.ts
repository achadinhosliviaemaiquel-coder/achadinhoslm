import { useQuery } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"

export type Offer = {
  id: string
  platform: string
  title: string
  url: string
  image_url: string
  price: number
  old_price: number | null
  discount_pct: number | null
  coupon_code: string | null
  final_price: number | null
  last_posted_at: string
  status: string
}

export function useRecentOffers(limit = 12) {
  return useQuery({
    queryKey: ["recent-offers", limit],
    queryFn: async (): Promise<Offer[]> => {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from("offers")
        .select("*")
        .eq("status", "active")
        .order("last_posted_at", { ascending: false })
        .limit(limit)

      if (error) throw error
      return (data ?? []) as Offer[]
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  })
}

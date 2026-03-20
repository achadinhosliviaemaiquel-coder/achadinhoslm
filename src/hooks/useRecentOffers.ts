import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
const supabase = getSupabase();

export type RecentOffer = {
  id: string;
  platform: string;
  title: string;
  url: string;
  image_url: string | null;
  price: number | null;
  old_price: number | null;
  discount_pct: number | null;
  coupon_code: string | null;
  final_price: number | null;
  last_posted_at: string;
};

export function useRecentOffers(limit = 12) {
  return useQuery({
    queryKey: ["recent-offers", limit],
    queryFn: async (): Promise<RecentOffer[]> => {
      const { data, error } = await supabase
        .from("offers")
        .select(
          "id, platform, title, url, image_url, price, old_price, discount_pct, coupon_code, final_price, last_posted_at"
        )
        .eq("status", "active")
        .not("last_posted_at", "is", null)
        .order("last_posted_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data as RecentOffer[]) ?? [];
    },
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 15,
  });
}
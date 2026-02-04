import { useSearchParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
const supabase = getSupabase();
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import type { Product } from "@/types/product";

export default function SearchPage() {
  const [params] = useSearchParams();
  const query = params.get("q") || "";

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["search-products", query],
    enabled: !!query,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_products", {
        search_text: query,
      });

      if (error) throw error;
      return (data || []) as Product[];
    },
    staleTime: 1000 * 60 * 2,
  });

  if (isLoading) {
    return (
      <Layout>
        <div className="grid grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-lg font-bold">
          Resultados para: <span className="text-primary">{query}</span>
        </h1>

        {products.length === 0 ? (
          <p className="text-muted-foreground">Nenhum produto encontrado.</p>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

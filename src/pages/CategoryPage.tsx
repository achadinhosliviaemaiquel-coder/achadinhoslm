import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product";
import { ChevronLeft, ChevronDown } from "lucide-react";

const PAGE_SIZE = 20; // Q56: paginação — 20 produtos por vez

function useCategoryProducts(category: string, page: number) {
  return useQuery({
    queryKey: ["category-products", category, page],
    queryFn: async () => {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await supabase
        .from("products")
        .select("*", { count: "exact" })
        .eq("category", category)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      return { products: data ?? [], total: count ?? 0 };
    },
    staleTime: 1000 * 60 * 5,
  });
}

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>();
  const [page, setPage] = useState(0);

  const categoryLabel =
    CATEGORY_LABELS[category as ProductCategory] ?? category ?? "";

  const { data, isLoading, error } = useCategoryProducts(
    category ?? "",
    page
  );

  const products = data?.products ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasMore = page < totalPages - 1;

  return (
    <Layout
      seo={{
        title: `${categoryLabel} em Promoção | Achadinhos LM`,
        description: `Confira os melhores produtos de ${categoryLabel} com preços baixos na Shopee, Amazon e Mercado Livre.`,
        canonical: `/category/${category}`,
      }}
      breadcrumb={[
        { name: "Início", url: "/" },
        { name: categoryLabel, url: `/category/${category}` },
      ]}
    >
      <div className="space-y-6">
        {/* Voltar */}
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold capitalize">{categoryLabel}</h1>
          {total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {total} produto{total !== 1 ? "s" : ""} encontrado
              {total !== 1 ? "s" : ""}
            </p>
          )}
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-square rounded-2xl" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-5 w-1/2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-center text-muted-foreground py-12">
            Erro ao carregar produtos.
          </p>
        ) : products.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <span className="text-5xl">📦</span>
            <p className="text-muted-foreground">
              Nenhum produto encontrado nesta categoria.
            </p>
            <Button variant="outline" asChild>
              <Link to="/">Ver todas as categorias</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>

            {/* Q56: Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                {hasMore ? (
                  <Button
                    variant="outline"
                    onClick={() => setPage((p) => p + 1)}
                    className="gap-2"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Carregar mais ({total - (page + 1) * PAGE_SIZE} restantes)
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Todos os {total} produtos carregados
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

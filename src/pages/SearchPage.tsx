import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { Layout } from "@/components/Layout";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/ProductCard";
import { getSupabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";

export default function SearchPage() {
  const supabase = getSupabase();

  const [params, setSearchParams] = useSearchParams();
  const urlQuery = params.get("q") || "";

  // Estado do input (controlado)
  const [inputValue, setInputValue] = useState(urlQuery);

  // Mantém o input sincronizado quando a URL muda (ex: back/forward)
  useEffect(() => {
    setInputValue(urlQuery);
  }, [urlQuery]);

  const inputRef = useRef<HTMLInputElement>(null);

  const query = useMemo(() => urlQuery.trim(), [urlQuery]);

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["search-products", query],
    enabled: query.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("search_products", {
        search_text: query,
      });

      if (error) throw error;
      return (data || []) as Product[];
    },
    staleTime: 1000 * 60 * 2,
  });

  function applySearch(next: string) {
    const q = next.trim();
    if (!q) {
      // limpa resultados ao apagar
      setSearchParams({});
      return;
    }
    setSearchParams({ q });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    applySearch(inputValue);
    inputRef.current?.blur(); // opcional: fecha teclado no mobile
  }

  function handleIconClick() {
    const el = inputRef.current;
    if (!el) return;

    const isFocused = document.activeElement === el;

    // 1º clique: foca (abre teclado no mobile)
    if (!isFocused) {
      requestAnimationFrame(() => el.focus());
      return;
    }

    // 2º clique (já focado): executa a busca
    applySearch(inputValue);
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Barra de busca (mobile-first) */}
        <form onSubmit={handleSubmit} className="relative">
          <input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Buscar produtos..."
            className="w-full rounded-xl border bg-background px-4 py-3 pr-12 text-base outline-none focus:ring-2 focus:ring-primary"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="search"
            enterKeyHint="search"
          />

          {/* IMPORTANTE: type="button" evita submit acidental no mobile */}
          <button
            type="button"
            onClick={handleIconClick}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-2 active:scale-95"
            aria-label="Pesquisar"
          >
            <Search className="h-5 w-5" />
          </button>
        </form>

        {query ? (
          <h1 className="text-lg font-bold">
            Resultados para: <span className="text-primary">{query}</span>
          </h1>
        ) : (
          <p className="text-muted-foreground">Digite um termo para pesquisar.</p>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : products.length === 0 && query ? (
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

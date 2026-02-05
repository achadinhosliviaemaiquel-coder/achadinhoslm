import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";

/* ================================
   FETCH PRODUCTS (PAGINAÇÃO REAL)
================================ */

export function useProducts(
  categorySlug?: string | "all",
  page: number = 1,
  sort: "new" | "price" | "views" = "new",
  store?: "shopee" | "mercadolivre" | "amazon" | "all",
  subcategory?: string,
) {
  const PAGE_SIZE = 10;

  return useQuery({
    queryKey: ["products", categorySlug, subcategory, page, sort, store],

    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("products")
        .select(
          `
          id,
          name,
          slug,
          description,
          benefits,
          image_urls,
          subcategory,
          brand_slug,
          views_count,
          created_at,
          shopee_price,
          amazon_price,
          mercadolivre_price,
          shopee_link,
          amazon_link,
          mercadolivre_link,
          price_label,
          urgency_label,
          review_url,
          is_active,
          categories:categories!products_category_id_fkey (
            id,
            slug,
            name
          )
          `,
          { count: "exact" }
        )
        .eq("is_active", true);

      // ✅ FILTRO CORRETO
      if (categorySlug && categorySlug !== "all") {
        query = query.eq("category", categorySlug);
      }

      if (subcategory) {
        query = query.eq("subcategory", subcategory);
      }

      if (store && store !== "all") {
        query = query.not(`${store}_link`, "is", null);
      }

      if (sort === "new") {
        query = query.order("created_at", { ascending: false });
      }

      if (sort === "views") {
        query = query.order("views_count", { ascending: false });
      }

      if (sort === "price") {
        query = query.order("shopee_price", { ascending: true, nullsFirst: false });
      }

      const { data, count, error } = await query.range(from, to);
      if (error) throw error;

      return {
        products: (data || []) as Product[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      };
    },

    keepPreviousData: true,
    staleTime: 1000 * 60 * 5,
  });
}

/* ================================
   FETCH PRODUCT BY SLUG
================================ */

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          `
          *,
          categories!inner (
            id,
            slug,
            name
          )
          `,
        )
        .eq("slug", slug)
        .single();

      if (error) throw error;
      return data as Product;
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  });
}

/* ================================
   CREATE PRODUCT
================================ */

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (product: any) => {
      const { data, error } = await supabase
        .from("products")
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/* ================================
   UPDATE PRODUCT
================================ */

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Product> & { id: string }) => {
      if (!id) throw new Error("Product ID is required for update");

      const payload = {
        name: updates.name,
        slug: updates.slug,
        description: updates.description ?? "",
        subcategory: updates.subcategory ?? null,

        brand_slug: updates.brand_slug ?? null,
        category: updates.category ?? null,

        image_urls: Array.isArray(updates.image_urls) ? updates.image_urls : [],
        benefits: Array.isArray(updates.benefits) ? updates.benefits : [],

        shopee_price: updates.shopee_price ?? null,
        amazon_price: updates.amazon_price ?? null,
        mercadolivre_price: updates.mercadolivre_price ?? null,

        shopee_link: updates.shopee_link ?? null,
        amazon_link: updates.amazon_link ?? null,
        mercadolivre_link: updates.mercadolivre_link ?? null,

        price_label: updates.price_label ?? null,
        urgency_label: updates.urgency_label ?? null,
        review_url: updates.review_url ?? null,

        is_active: updates.is_active ?? true,
      };

      const { data, error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("UPDATE PRODUCT ERROR:", error);
        throw error;
      }

      return data as Product;
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["product"] });
    },
  });
}

/* ================================
   DELETE PRODUCT
================================ */

export function useDeleteProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
}

/* ================================
   SEARCH PRODUCTS
================================ */

export function useSearchProducts(query: string, page: number = 1) {
  const PAGE_SIZE = 100;

  return useQuery({
    queryKey: ["products", "search", query, page],
    enabled: !!query,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("products")
        .select(
          `
          *,
          categories!inner (
            id,
            slug,
            name
          )
          `,
          { count: "exact" },
        )
        .eq("is_active", true)
        .or(
          `name.ilike.%${query}%,description.ilike.%${query}%,subcategory.ilike.%${query}%`,
        )
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (error) throw error;

      return {
        products: (data || []) as Product[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      };
    },
  });
}

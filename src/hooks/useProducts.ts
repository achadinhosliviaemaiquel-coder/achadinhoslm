import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type { Product } from "@/types/product";

/**
 * ✅ useProducts.ts — versão corrigida e estável
 */

const PRODUCT_SELECT_FIELDS = `
  id,
  name,
  slug,
  category,
  subcategory,
  description,
  benefits,
  price_label,
  urgency_label,
  image_urls,
  shopee_link,
  mercadolivre_link,
  amazon_link,
  shopee_price,
  mercadolivre_price,
  amazon_price,
  review_url,
  is_active,
  created_at,
  updated_at,
  created_by,
  is_featured,
  views,
  views_count,
  brand_slug,
  category_id,
  source_url
`;

/**
 * Mantém apenas chaves cujo valor !== undefined
 * (null é enviado e LIMPA o campo no banco)
 */
function cleanUndefined<T extends Record<string, any>>(obj: T) {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * Converte string vazia em null (essencial para UPDATE)
 */
function emptyStringToNull(v: any) {
  return v === "" ? null : v;
}

/* ================================
   FETCH PRODUCTS
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
    queryKey: ["products", categorySlug ?? "all", subcategory ?? null, page, sort, store ?? "all"],

    queryFn: async () => {
      const supabase = getSupabase();
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = supabase
        .from("products")
        .select(PRODUCT_SELECT_FIELDS, { count: "exact" })
        .eq("is_active", true);

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
      } else if (sort === "views") {
        query = query.order("views_count", { ascending: false });
      } else if (sort === "price") {
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
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT_FIELDS)
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
      const supabase = getSupabase();

      const payload = cleanUndefined({
        name: product.name,
        slug: product.slug,
        description: product.description ?? null,
        category: product.category ?? null,
        subcategory: product.subcategory ?? null,
        brand_slug: product.brand_slug ?? null,
        image_urls: Array.isArray(product.image_urls) ? product.image_urls : [],
        benefits: Array.isArray(product.benefits) ? product.benefits : [],
        price_label: product.price_label ?? null,
        urgency_label: product.urgency_label ?? null,
        review_url: product.review_url ?? null,
        shopee_link: product.shopee_link ?? null,
        mercadolivre_link: product.mercadolivre_link ?? null,
        amazon_link: product.amazon_link ?? null,
        shopee_price: product.shopee_price ?? null,
        mercadolivre_price: product.mercadolivre_price ?? null,
        amazon_price: product.amazon_price ?? null,
        is_active: product.is_active ?? true,
        category_id: product.category_id ?? undefined,
        source_url: product.source_url ?? null,
      });

      const { data, error } = await supabase
        .from("products")
        .insert(payload)
        .select(PRODUCT_SELECT_FIELDS)
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
   UPDATE PRODUCT (CORRIGIDO)
================================ */

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      if (!id) throw new Error("Product ID is required for update");
      const supabase = getSupabase();

      const payload = cleanUndefined({
        name: updates.name,
        slug: updates.slug,

        description: updates.description ?? undefined,
        category: updates.category ?? undefined,
        subcategory: updates.subcategory ?? undefined,
        brand_slug: updates.brand_slug ?? undefined,

        image_urls: Array.isArray(updates.image_urls) ? updates.image_urls : undefined,
        benefits: Array.isArray(updates.benefits) ? updates.benefits : undefined,

        shopee_link: emptyStringToNull(updates.shopee_link),
        mercadolivre_link: emptyStringToNull(updates.mercadolivre_link),
        amazon_link: emptyStringToNull(updates.amazon_link),

        shopee_price: updates.shopee_price === "" ? null : updates.shopee_price,
        mercadolivre_price: updates.mercadolivre_price === "" ? null : updates.mercadolivre_price,
        amazon_price: updates.amazon_price === "" ? null : updates.amazon_price,

        price_label: updates.price_label ?? undefined,
        urgency_label: updates.urgency_label ?? undefined,
        review_url: emptyStringToNull(updates.review_url),

        is_active: updates.is_active ?? undefined,
        category_id: updates.category_id ?? undefined,
        source_url: emptyStringToNull(updates.source_url),
      });

      const { data, error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", id)
        .select(PRODUCT_SELECT_FIELDS)
        .single();

      if (error) throw error;
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
      const supabase = getSupabase();
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
      const supabase = getSupabase();

      const { data, error, count } = await supabase
        .from("products")
        .select(PRODUCT_SELECT_FIELDS, { count: "exact" })
        .eq("is_active", true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,subcategory.ilike.%${query}%`)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (error) throw error;

      return {
        products: (data || []) as Product[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      };
    },
    staleTime: 1000 * 30,
  });
}

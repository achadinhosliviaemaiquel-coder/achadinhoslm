import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { getSupabase } from "@/integrations/supabase/client"
import type { Product } from "@/types/product"

/**
 * ✅ useProducts.ts (estável para produção)
 *
 * - NÃO usa select("*") (evita PGRST204 / schema cache quando frontend tem campos que o banco não tem)
 * - Trata categorySlug === "all" corretamente (não filtra categoria)
 * - NÃO referencia source_url em lugar nenhum (vamos ajustar depois no ProductForm e/ou criar a coluna no Supabase)
 */

const PRODUCT_SELECT_FIELDS = `
  id,
  name,
  slug,
  description,
  benefits,
  image_urls,
  category,
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
  is_active
`

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
  const PAGE_SIZE = 10

  return useQuery({
    queryKey: ["products", categorySlug ?? "all", subcategory ?? null, page, sort, store ?? "all"],

    queryFn: async () => {
      const supabase = getSupabase()

      const from = (page - 1) * PAGE_SIZE
      const to = from + PAGE_SIZE - 1

      let query = supabase
        .from("products")
        .select(PRODUCT_SELECT_FIELDS, { count: "exact" })
        .eq("is_active", true)

      // ✅ "all" não filtra categoria
      if (categorySlug && categorySlug !== "all") {
        query = query.eq("category", categorySlug)
      }

      if (subcategory) {
        query = query.eq("subcategory", subcategory)
      }

      if (store && store !== "all") {
        query = query.not(`${store}_link`, "is", null)
      }

      if (sort === "new") {
        query = query.order("created_at", { ascending: false })
      } else if (sort === "views") {
        query = query.order("views_count", { ascending: false })
      } else if (sort === "price") {
        // mantém seu comportamento: ordenar por shopee_price
        query = query.order("shopee_price", { ascending: true, nullsFirst: false })
      }

      const { data, count, error } = await query.range(from, to)
      if (error) throw error

      return {
        products: (data || []) as Product[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      }
    },

    keepPreviousData: true,
    staleTime: 1000 * 60 * 5,
  })
}

/* ================================
   FETCH PRODUCT BY SLUG
================================ */

export function useProduct(slug: string) {
  return useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from("products")
        .select(PRODUCT_SELECT_FIELDS)
        .eq("slug", slug)
        .single()

      if (error) throw error
      return data as Product
    },
    enabled: !!slug,
    staleTime: 1000 * 60 * 10,
    refetchOnWindowFocus: false,
  })
}

/* ================================
   CREATE PRODUCT
================================ */

export function useCreateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: any) => {
      const supabase = getSupabase()

      // ✅ payload defensivo (evita enviar chaves extras tipo source_url antes da coluna existir)
      const payload: any = {
        name: product.name,
        slug: product.slug,
        description: product.description ?? null,
        category: product.category ?? null,
        subcategory: product.subcategory ?? null,
        brand_slug: product.brand_slug ?? null,
        image_urls: Array.isArray(product.image_urls) ? product.image_urls : [],
        benefits: Array.isArray(product.benefits) ? product.benefits : [],
        price_label: product.price_label ?? null,
        shopee_link: product.shopee_link ?? null,
        mercadolivre_link: product.mercadolivre_link ?? null,
        amazon_link: product.amazon_link ?? null,
        shopee_price: product.shopee_price ?? null,
        mercadolivre_price: product.mercadolivre_price ?? null,
        amazon_price: product.amazon_price ?? null,
        urgency_label: product.urgency_label ?? null,
        review_url: product.review_url ?? null,
        is_active: product.is_active ?? true,
      }

      // se existir no seu banco, mantém compatibilidade
      if (product.category_id) payload.category_id = product.category_id

      const { data, error } = await supabase
        .from("products")
        .insert(payload)
        .select(PRODUCT_SELECT_FIELDS)
        .single()

      if (error) throw error
      return data as Product
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
    },
  })
}

/* ================================
   UPDATE PRODUCT
================================ */

export function useUpdateProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const supabase = getSupabase()
      if (!id) throw new Error("Product ID is required for update")

      const payload: any = {
        name: (updates as any).name,
        slug: (updates as any).slug,
        description: (updates as any).description ?? null,
        category: (updates as any).category ?? null,
        subcategory: (updates as any).subcategory ?? null,
        brand_slug: (updates as any).brand_slug ?? null,
        image_urls: Array.isArray((updates as any).image_urls) ? (updates as any).image_urls : [],
        benefits: Array.isArray((updates as any).benefits) ? (updates as any).benefits : [],
        shopee_price: (updates as any).shopee_price ?? null,
        amazon_price: (updates as any).amazon_price ?? null,
        mercadolivre_price: (updates as any).mercadolivre_price ?? null,
        shopee_link: (updates as any).shopee_link ?? null,
        amazon_link: (updates as any).amazon_link ?? null,
        mercadolivre_link: (updates as any).mercadolivre_link ?? null,
        price_label: (updates as any).price_label ?? null,
        urgency_label: (updates as any).urgency_label ?? null,
        review_url: (updates as any).review_url ?? null,
        is_active: (updates as any).is_active ?? true,
      }

      // se existir no seu banco, mantém compatibilidade
      if ((updates as any).category_id) payload.category_id = (updates as any).category_id

      const { data, error } = await supabase
        .from("products")
        .update(payload)
        .eq("id", id)
        .select(PRODUCT_SELECT_FIELDS)
        .single()

      if (error) throw error
      return data as Product
    },

    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
      queryClient.invalidateQueries({ queryKey: ["product"] })
    },
  })
}

/* ================================
   DELETE PRODUCT
================================ */

export function useDeleteProduct() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = getSupabase()
      const { error } = await supabase.from("products").delete().eq("id", id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] })
    },
  })
}

/* ================================
   SEARCH PRODUCTS
================================ */

export function useSearchProducts(query: string, page: number = 1) {
  const PAGE_SIZE = 100

  return useQuery({
    queryKey: ["products", "search", query, page],
    enabled: !!query,
    queryFn: async () => {
      const supabase = getSupabase()

      const { data, error, count } = await supabase
        .from("products")
        .select(PRODUCT_SELECT_FIELDS, { count: "exact" })
        .eq("is_active", true)
        .or(`name.ilike.%${query}%,description.ilike.%${query}%,subcategory.ilike.%${query}%`)
        .order("created_at", { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (error) throw error

      return {
        products: (data || []) as Product[],
        total: count || 0,
        totalPages: Math.ceil((count || 0) / PAGE_SIZE),
      }
    },
    staleTime: 1000 * 30,
  })
}

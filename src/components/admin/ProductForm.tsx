// src/components/admin/ProductForm.tsx
import { useState, useEffect, useRef, useMemo } from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateProduct, useUpdateProduct } from "@/hooks/useProducts"
import { useBrands } from "@/hooks/useBrands"
import { useToast } from "@/hooks/use-toast"
import { CATEGORY_LABELS, type Product, type ProductCategory } from "@/types/product"
import { Loader2 } from "lucide-react"
import BrandFormModal from "@/components/admin/BrandFormModal"
import { getSupabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"

const SUBCATEGORY_OPTIONS: Record<string, { value: string; label: string; keywords: string[] }[]> = {
  beleza: [
    { value: "limpeza", label: "Limpeza Facial", keywords: ["gel", "sabonete", "limpeza", "cleanser"] },
    { value: "hidratante", label: "Hidratantes", keywords: ["hidratante", "creme", "loção", "locao"] },
    { value: "protetor_solar", label: "Protetor Solar", keywords: ["protetor", "solar", "fps"] },
    { value: "tratamento", label: "Tratamentos", keywords: ["serum", "ácido", "acido", "antiacne", "reparador"] },
    { value: "capilar", label: "Capilar", keywords: ["shampoo", "condicionador", "capilar"] },
    { value: "kits", label: "Kits", keywords: ["kit", "combo"] },
  ],
  casa: [
    { value: "cama", label: "Cama", keywords: ["lencol", "travesseiro", "manta"] },
    { value: "banho", label: "Banho", keywords: ["toalha", "tapete", "banheiro"] },
    { value: "cozinha", label: "Cozinha", keywords: ["cafeteira", "panela", "faca", "mixer", "microondas", "forno"] },
    { value: "limpeza", label: "Limpeza", keywords: ["mop", "aspirador", "pano"] },
    { value: "organizacao", label: "Organização", keywords: ["organizador", "caixa", "gaveta"] },
  ],
  eletrodomesticos: [
    { value: "airfryer", label: "Air Fryers", keywords: ["airfryer"] },
    { value: "microondas", label: "Micro-ondas", keywords: ["microondas"] },
    { value: "aspirador", label: "Aspiradores", keywords: ["aspirador"] },
    { value: "cafeteira", label: "Cafeteiras Elétricas", keywords: ["cafeteira"] },
    { value: "forno", label: "Fornos Elétricos", keywords: ["forno"] },
  ],
  eletronicos: [
    { value: "audio", label: "Áudio", keywords: ["fone", "bluetooth", "headset"] },
    { value: "imagem", label: "Imagem", keywords: ["camera", "projetor"] },
    { value: "seguranca", label: "Segurança", keywords: ["fechadura"] },
    { value: "automotivo", label: "Automotivo", keywords: ["carplay"] },
  ],
  escritorio: [
    { value: "papelaria", label: "Papelaria", keywords: ["lápis", "caneta", "giz", "papel"] },
    { value: "mochilas", label: "Mochilas e Estojos", keywords: ["mochila", "estojo"] },
    { value: "cadernos", label: "Cadernos", keywords: ["caderno"] },
  ],
  infantil: [
    { value: "brinquedos", label: "Brinquedos", keywords: ["brinquedo"] },
    { value: "roupas", label: "Roupas Infantis", keywords: ["roupa"] },
    { value: "calcados-infantis", label: "Calçados Infantis", keywords: ["tênis", "tenis"] },
  ],
  moda: [
    { value: "vestidos", label: "Vestidos", keywords: ["vestido"] },
    { value: "acessorios", label: "Acessórios", keywords: ["colar", "pulseira"] },
    { value: "intimos", label: "Roupas Íntimas", keywords: ["cueca", "sutiã", "sutia", "meia"] },
    { value: "academia", label: "Roupas de Academia", keywords: ["short", "regata", "top"] },
  ],
  pets: [
    { value: "brinquedos", label: "Brinquedos", keywords: ["brinquedo"] },
    { value: "racoes", label: "Rações", keywords: ["ração", "racao"] },
    { value: "higiene", label: "Higiene", keywords: ["shampoo", "cortador"] },
    { value: "caixas", label: "Armazenamento", keywords: ["caixa"] },
  ],
  suplementos: [
    { value: "creatina", label: "Creatina", keywords: ["creatina"] },
    { value: "whey", label: "Whey", keywords: ["whey"] },
    { value: "pretreino", label: "Pré-Treino", keywords: ["pre", "pré"] },
  ],
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v)

const emptyNumberToNull = (v: unknown) => {
  if (v === "" || v === undefined || v === null) return null
  if (typeof v === "string") {
    const normalized = v.replace(",", ".")
    const n = Number(normalized)
    return Number.isFinite(n) ? n : null
  }
  return Number.isFinite(v as number) ? (v as number) : null
}

const normalizeUrlOrNull = (v: unknown): string | null => {
  const s = String(v ?? "").trim()
  if (!s) return null
  if (/^https?:\/\//i.test(s)) return s
  if (/^www\./i.test(s)) return `https://${s}`
  if (/^[a-z0-9.-]+\.[a-z]{2,}\/?/i.test(s)) return `https://${s}`
  return s
}

function formatBRLFromNumber(n: number) {
  return `R$ ${n.toFixed(2).replace(".", ",")}`
}

function computeMinPriceLabel(prices: Array<number | null | undefined>): string | null {
  const valid = prices.filter((p): p is number => typeof p === "number" && Number.isFinite(p) && p > 0)
  if (!valid.length) return null
  const min = Math.min(...valid)
  return formatBRLFromNumber(min)
}

async function resolveCategoryIdBySlug(categorySlug: string) {
  const supabase = getSupabase()
  if (!categorySlug || categorySlug === "all") return null

  const { data, error } = await supabase.from("categories").select("id").eq("slug", categorySlug).maybeSingle()
  if (error) throw error
  if (data?.id) return data.id

  const { data: created, error: cErr } = await supabase
    .from("categories")
    .insert({ slug: categorySlug, name: CATEGORY_LABELS[categorySlug as ProductCategory] ?? categorySlug })
    .select("id")
    .single()

  if (cErr) throw cErr
  return created?.id ?? null
}

const productSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  slug: z.string().min(1, "Slug é obrigatório"),

  category: z.string().min(1).refine((v) => v !== "all", {
    message: 'Categoria inválida ("all")',
  }),

  // ✅ Marca agora é SEMPRE aceitável:
  // - se vier vazio/null => "generico"
  // - se vier preenchida => mantém
  brand_slug: z.preprocess(
    (v) => {
      const s = String(v ?? "").trim()
      return s ? s : "generico"
    },
    z.string().min(1).default("generico"),
  ),

  subcategory: z.preprocess(emptyToNull, z.string().nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  benefits: z.preprocess(emptyToNull, z.string().nullable().optional()),

  price_label: z.preprocess(emptyToNull, z.string().nullable().optional()),
  image_urls: z.preprocess(emptyToNull, z.string().nullable().optional()),

  source_url: z.preprocess(normalizeUrlOrNull, z.string().url().nullable().optional()),

  shopee_price: z.preprocess(emptyNumberToNull, z.number().nullable().optional()),
  mercadolivre_price: z.preprocess(emptyNumberToNull, z.number().nullable().optional()),
  amazon_price: z.preprocess(emptyNumberToNull, z.number().nullable().optional()),

  shopee_link: z.preprocess(normalizeUrlOrNull, z.string().url().nullable().optional()),
  mercadolivre_link: z.preprocess(normalizeUrlOrNull, z.string().url().nullable().optional()),
  amazon_link: z.preprocess(normalizeUrlOrNull, z.string().url().nullable().optional()),

  review_url: z.preprocess(normalizeUrlOrNull, z.string().url().nullable().optional()),
})

type ProductFormData = z.infer<typeof productSchema>

interface Props {
  product?: Product
  onSuccess?: () => void
}

export function ProductForm({ product, onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [brandModalOpen, setBrandModalOpen] = useState(false)

  const queryClient = useQueryClient()
  const createProduct = useCreateProduct()
  const updateProduct = useUpdateProduct()
  const { toast } = useToast()

  const { register, handleSubmit, setValue, watch, reset, control } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      slug: "",
      category: "",
      brand_slug: "generico",
      subcategory: "",
      description: "",
      benefits: "",
      image_urls: "",
      price_label: "",
      source_url: "",
      shopee_link: "",
      mercadolivre_link: "",
      amazon_link: "",
      shopee_price: null,
      mercadolivre_price: null,
      amazon_price: null,
      review_url: "",
    },
  })

  const shopeeLink = watch("shopee_link")
  const mlLink = watch("mercadolivre_link")
  const amazonLink = watch("amazon_link")

  useEffect(() => {
    if (!shopeeLink) setValue("shopee_price", null)
  }, [shopeeLink, setValue])

  useEffect(() => {
    if (!mlLink) setValue("mercadolivre_price", null)
  }, [mlLink, setValue])

  useEffect(() => {
    if (!amazonLink) setValue("amazon_price", null)
  }, [amazonLink, setValue])

  useEffect(() => {
    if (!product) return
    reset({
      name: (product as any)?.name ?? "",
      slug: (product as any)?.slug ?? "",
      category: (product as any)?.category?.slug ?? (product as any)?.category_slug ?? (product as any)?.category ?? "",
      brand_slug: (product as any)?.brand_slug ?? "generico",
      description: (product as any)?.description ?? "",
      benefits: Array.isArray((product as any)?.benefits) ? (product as any).benefits.join("\n") : "",
      image_urls: Array.isArray((product as any)?.image_urls) ? (product as any).image_urls.join("\n") : "",
      price_label: (product as any)?.price_label ?? "",
      subcategory: (product as any)?.subcategory ?? "",
      source_url: (product as any)?.source_url ?? (product as any)?.url ?? "",
      shopee_link: (product as any)?.shopee_link ?? "",
      mercadolivre_link: (product as any)?.mercadolivre_link ?? "",
      amazon_link: (product as any)?.amazon_link ?? "",
      shopee_price: (product as any)?.shopee_price ?? null,
      mercadolivre_price: (product as any)?.mercadolivre_price ?? null,
      amazon_price: (product as any)?.amazon_price ?? null,
      review_url: (product as any)?.review_url ?? "",
      subcategory: (product as any)?.subcategory ?? "",
    })
  }, [product, reset])

  const category = watch("category") || ""
  const name = watch("name")
  const brandSlugWatched = watch("brand_slug") || "generico"

  const { data: brands, refetch } = useBrands(category)

  const normalize = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  const handleNameChange = (value: string) => {
    if (!product) {
      const slug = normalize(value).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
      setValue("slug", slug)
    }
  }

  // ✅ AUTO: recalcula "price_label" a partir do menor preço
  const shopeePrice = watch("shopee_price")
  const mlPrice = watch("mercadolivre_price")
  const amazonPrice = watch("amazon_price")

  const autoPriceLabel = useMemo(() => {
    return computeMinPriceLabel([shopeePrice ?? null, mlPrice ?? null, amazonPrice ?? null])
  }, [shopeePrice, mlPrice, amazonPrice])

  useEffect(() => {
    setValue("price_label", autoPriceLabel ?? "", { shouldDirty: true, shouldValidate: false })
  }, [autoPriceLabel, setValue])

  // ✅ Se a categoria mudar e a marca atual não existir na lista dessa categoria,
  // volta pra "generico" (evita Select ficar com valor inválido/invisível)
  useEffect(() => {
    if (!category) return
    if (!brands) return

    const current = (brandSlugWatched || "generico").trim() || "generico"
    if (current === "generico") return

    const existsInList = brands.some((b) => b.slug === current)
    if (!existsInList) {
      setValue("brand_slug", "generico", { shouldDirty: true, shouldValidate: true })
    }
  }, [category, brands, brandSlugWatched, setValue])

  const onSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true)
    try {
      const resolvedCategoryId = await resolveCategoryIdBySlug(data.category)
      const categoryId = resolvedCategoryId ?? (product as any)?.category_id ?? (product as any)?.categoryId ?? null

      if (!categoryId) {
        toast({
          variant: "destructive",
          title: "Categoria inválida",
          description: "Selecione uma categoria válida.",
        })
        return
      }

      const benefitsArr = data.benefits ? data.benefits.split("\n").map((b) => b.trim()).filter(Boolean) : []
      const imagesArr = data.image_urls ? data.image_urls.split("\n").map((i) => i.trim()).filter(Boolean) : []

      // ✅ força o label calculado (100% automático)
      const finalPriceLabel =
        computeMinPriceLabel([data.shopee_price ?? null, data.mercadolivre_price ?? null, data.amazon_price ?? null]) ??
        null

      // ✅ garante sempre "generico" se vier vazio
      const brandSlug = (data.brand_slug || "generico").trim() || "generico"

      const productData: any = {
        ...data,
        brand_slug: brandSlug,
        category_id: categoryId,
        category: data.category as ProductCategory,
        benefits: benefitsArr,
        image_urls: imagesArr,
        is_active: true,

        price_label: finalPriceLabel,

        source_url: data.source_url ?? null,
        review_url: data.review_url ?? null,

        shopee_link: data.shopee_link ?? null,
        mercadolivre_link: data.mercadolivre_link ?? null,
        amazon_link: data.amazon_link ?? null,

        shopee_price: data.shopee_price ?? null,
        mercadolivre_price: data.mercadolivre_price ?? null,
        amazon_price: data.amazon_price ?? null,
      }

      if (product) {
        await updateProduct.mutateAsync({ id: (product as any).id, ...productData })
      } else {
        await createProduct.mutateAsync(productData)
      }

      await queryClient.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey.some((k) => String(k).includes("products")),
      })

      toast({ title: product ? "Produto atualizado!" : "Produto criado!" })
      reset()
      onSuccess?.()
    } catch (err) {
      console.error(err)
      toast({ variant: "destructive", title: "Erro ao salvar" })
    } finally {
      setIsSubmitting(false)
    }
  }

  const previousCategoryRef = useRef<string | undefined>()
  useEffect(() => {
    if (!previousCategoryRef.current) {
      previousCategoryRef.current = category
      return
    }
    if (previousCategoryRef.current !== category) {
      setValue("subcategory", "")
    }
    previousCategoryRef.current = category
  }, [category, setValue])

  useEffect(() => {
    if (!name || !category || !SUBCATEGORY_OPTIONS[category]) return
    const normalizedName = name.toLowerCase()
    const match = SUBCATEGORY_OPTIONS[category].find((sub) => sub.keywords.some((k) => normalizedName.includes(k)))
    if (match) setValue("subcategory", match.value)
  }, [name, category, setValue])

  return (
    <>
      <form
        noValidate
        onSubmit={handleSubmit(onSubmit, (errors) => {
          console.log("❌ Erros de validação do ProductForm:", errors)
          toast({
            variant: "destructive",
            title: "Verifique os campos obrigatórios",
            description: "Abra o console para ver quais campos estão inválidos.",
          })
        })}
        className="space-y-6"
      >
        <Input
          {...register("name", {
            onChange: (e) => handleNameChange((e.target as HTMLInputElement).value),
          })}
          placeholder="Nome do produto"
        />

        <Input {...register("slug")} placeholder="Slug" />

        {/* ✅ A PARTIR DE (AUTO) */}
        <div className="space-y-2">
          <Label>A partir de (automático)</Label>
          <Input
            {...register("price_label")}
            readOnly
            className="opacity-80"
            value={autoPriceLabel ?? ""}
            placeholder="Calculado automaticamente pelo menor preço"
          />
          <p className="text-xs text-muted-foreground">
            Este valor é calculado automaticamente pelo menor preço (Shopee/ML/Amazon).
          </p>
        </div>

        <div className="space-y-2">
          <Label>URL do Produto (opcional)</Label>
          <Input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...register("source_url", {
              setValueAs: (v) => normalizeUrlOrNull(v) ?? "",
            })}
            placeholder="https://... ou www..."
          />
          <p className="text-xs text-muted-foreground">
            Opcional. Aceita link longo e também começando com <code>www.</code>
          </p>
        </div>

        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />

        {category && SUBCATEGORY_OPTIONS[category] && (
          <div className="space-y-2">
            <Label>Subcategoria</Label>

            <Controller
              name="subcategory"
              control={control}
              render={({ field }) => (
                <Select value={field.value || ""} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma subcategoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBCATEGORY_OPTIONS[category].map((sub) => (
                      <SelectItem key={sub.value} value={sub.value}>
                        {sub.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />

            <p className="text-xs text-muted-foreground">
              Opcional. Ajuda na organização e filtros (ex.: Moda → Vestidos).
            </p>
          </div>
        )}

        <Label>Marca</Label>

        <Controller
          name="brand_slug"
          control={control}
          render={({ field }) => (
            <Select value={field.value || "generico"} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Marca" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="generico">Genérico</SelectItem>

                {brands?.filter((b) => b.slug !== "generico").map((b) => (
                  <SelectItem key={b.slug} value={b.slug}>
                    {b.name}
                  </SelectItem>
                ))}

                <div className="border-t mt-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBrandModalOpen(true)}
                    className="text-sm text-primary hover:underline px-2 py-1"
                  >
                    + Criar nova marca
                  </button>
                </div>
              </SelectContent>
            </Select>
          )}
        />

        <Textarea {...register("description")} placeholder="Descrição" />
        <Textarea {...register("benefits")} placeholder="Benefícios (1 por linha)" />

        <Label>URLs das imagens (1 por linha)</Label>
        <Textarea {...register("image_urls")} rows={3} />

        <div className="space-y-4">
          <h2 className="font-semibold">Links de Afiliado</h2>

          <Input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...register("shopee_link", { setValueAs: (v) => normalizeUrlOrNull(v) ?? "" })}
            placeholder="Link Shopee"
          />
          <Input
            type="number"
            step="0.01"
            {...register("shopee_price", { setValueAs: (v) => (v === "" ? null : Number(String(v).replace(",", "."))) })}
            placeholder="Preço Shopee"
          />

          <Input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...register("mercadolivre_link", { setValueAs: (v) => normalizeUrlOrNull(v) ?? "" })}
            placeholder="Link Mercado Livre"
          />
          <Input
            type="number"
            step="0.01"
            {...register("mercadolivre_price", {
              setValueAs: (v) => (v === "" ? null : Number(String(v).replace(",", "."))),
            })}
            placeholder="Preço Mercado Livre"
          />

          <Input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...register("amazon_link", { setValueAs: (v) => normalizeUrlOrNull(v) ?? "" })}
            placeholder="Link Amazon"
          />
          <Input
            type="number"
            step="0.01"
            {...register("amazon_price", { setValueAs: (v) => (v === "" ? null : Number(String(v).replace(",", "."))) })}
            placeholder="Preço Amazon"
          />
        </div>

        <div className="space-y-2">
          <Label>Review (YouTube ou Instagram)</Label>
          <Input
            type="text"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            {...register("review_url", { setValueAs: (v) => normalizeUrlOrNull(v) ?? "" })}
            placeholder="https://... ou www..."
          />
          <p className="text-xs text-muted-foreground">Opcional. Ajuda quem está indeciso a comprar.</p>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : product ? "Atualizar Produto" : "Criar Produto"}
        </Button>
      </form>

      <BrandFormModal
        open={brandModalOpen}
        onOpenChange={setBrandModalOpen}
        category={category}
        onCreated={(newBrand) => {
          setValue("brand_slug", newBrand.slug)
          refetch()
        }}
      />
    </>
  )
}

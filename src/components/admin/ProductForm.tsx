import { useState, useEffect, useRef } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useProducts'
import { useBrands } from '@/hooks/useBrands'
import { useToast } from '@/hooks/use-toast'
import { CATEGORY_LABELS, type Product, type ProductCategory } from '@/types/product'
import { Loader2 } from 'lucide-react'
import BrandFormModal from '@/components/admin/BrandFormModal'
import { getSupabase } from '@/integrations/supabase/client'

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

const emptyToNull = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? null : v

// ✅ deixa number vazio virar null (e evita NaN travando o submit)
const emptyNumberToNull = (v: unknown) => {
  if (v === "" || v === undefined || v === null) return null

  if (typeof v === "string") {
    const normalized = v.replace(",", ".")
    const n = Number(normalized)
    return Number.isFinite(n) ? n : null
  }

  return Number.isFinite(v as number) ? v : null
}


// ✅ resolve category_id a partir do slug (protege contra "all")
async function resolveCategoryIdBySlug(categorySlug: string) {
  const supabase = getSupabase()

  if (!categorySlug || categorySlug === "all") return null

  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("slug", categorySlug)
    .maybeSingle()

  if (error) throw error
  return data?.id ?? null
}

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),

  // ✅ impede "all" e obriga selecionar algo válido
  category: z.string().min(1).refine((v) => v !== "all", {
    message: 'Categoria inválida ("all")',
  }),

  brand_slug: z.string().min(1),

  subcategory: z.preprocess(emptyToNull, z.string().nullable().optional()),
  description: z.preprocess(emptyToNull, z.string().nullable().optional()),
  benefits: z.preprocess(emptyToNull, z.string().nullable().optional()),

  price_label: z.string().min(1),
  image_urls: z.preprocess(emptyToNull, z.string().nullable().optional()),

  // ✅ CORRIGIDO
  shopee_price: z.preprocess(emptyNumberToNull, z.number().nullable().optional()),
  mercadolivre_price: z.preprocess(emptyNumberToNull, z.number().nullable().optional()),
  amazon_price: z.preprocess(emptyNumberToNull, z.number().nullable().optional()),

  shopee_link: z.preprocess(emptyToNull, z.string().url().nullable().optional()),
  mercadolivre_link: z.preprocess(emptyToNull, z.string().url().nullable().optional()),
  amazon_link: z.preprocess(emptyToNull, z.string().url().nullable().optional()),

  // ✅ Review
  review_url: z.preprocess(emptyToNull, z.string().url().nullable().optional()),
})

type ProductFormData = z.infer<typeof productSchema>

interface Props {
  product?: Product
  onSuccess?: () => void
}

export function ProductForm({ product, onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [brandModalOpen, setBrandModalOpen] = useState(false)

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
      shopee_link: "",
      mercadolivre_link: "",
      amazon_link: "",
      shopee_price: null,
      mercadolivre_price: null,
      amazon_price: null,
      review_url: "",
    },
  })

  useEffect(() => {
    if (!product) return

    reset({
      name: product.name ?? "",
      slug: product.slug ?? "",

      // ✅ mais tolerante (se vier category.slug do select com join)
      category:
        (product as any)?.category?.slug ??
        (product as any)?.category_slug ??
        (product as any)?.category ??
        "",

      brand_slug: product.brand_slug ?? "generico",
      description: product.description ?? "",
      benefits: product.benefits?.join('\n') ?? "",
      image_urls: product.image_urls?.join('\n') ?? "",
      price_label: product.price_label ?? "",
      subcategory: product.subcategory ?? "",
      shopee_link: product.shopee_link ?? "",
      mercadolivre_link: product.mercadolivre_link ?? "",
      amazon_link: product.amazon_link ?? "",
      shopee_price: product.shopee_price ?? null,
      mercadolivre_price: product.mercadolivre_price ?? null,
      amazon_price: product.amazon_price ?? null,
      review_url: (product as any).review_url ?? "",
    })
  }, [product, reset])

  const category = watch('category') || ""
  const name = watch('name')
  const { data: brands, refetch } = useBrands(category)

  const normalize = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")

  const handleNameChange = (value: string) => {
    if (!product) {
      const slug = normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      setValue('slug', slug)
    }
  }

  const onSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true)
    try {
      const resolvedCategoryId = await resolveCategoryIdBySlug(data.category)

      const categoryId =
        resolvedCategoryId ??
        (product as any)?.category_id ??
        (product as any)?.categoryId ??
        null

      if (!categoryId) {
        toast({
          variant: "destructive",
          title: "Campos inválidos",
          description: "Verifique os preços e URLs preenchidos."
        })
        return
      }

      const productData = {
        ...data,

        // ✅ essencial para o NOT NULL do banco
        category_id: categoryId,

        // mantém compatibilidade com seu tipo local (opcional)
        category: data.category as ProductCategory,

        benefits: data.benefits ? data.benefits.split('\n').map(b => b.trim()).filter(Boolean) : [],
        image_urls: data.image_urls ? data.image_urls.split('\n').map(i => i.trim()).filter(Boolean) : [],
        is_active: true,

        // garante null quando vazio (schema já faz, mas aqui mantém explícito)
        review_url: data.review_url ?? null,
        shopee_price: data.shopee_price ?? null,
        mercadolivre_price: data.mercadolivre_price ?? null,
        amazon_price: data.amazon_price ?? null,
      }

      if (product) await updateProduct.mutateAsync({ id: product.id, ...productData })
      else await createProduct.mutateAsync(productData)

      toast({ title: product ? 'Produto atualizado!' : 'Produto criado!' })
      reset()
      onSuccess?.()
    } catch (err) {
      console.error(err)
      toast({ variant: 'destructive', title: 'Erro ao salvar' })
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
    const normalized = name.toLowerCase()
    const match = SUBCATEGORY_OPTIONS[category].find(sub =>
      sub.keywords.some(k => normalized.includes(k))
    )
    if (match) setValue("subcategory", match.value)
  }, [name, category, setValue])

  const nameField = register("name")

  return (
    <>
      <form
        onSubmit={handleSubmit(
          onSubmit,
          (errors) => {
            console.log("❌ Erros de validação do ProductForm:", errors)
            toast({
              variant: "destructive",
              title: "Verifique os campos obrigatórios",
              description: "Abra o console para ver quais campos estão inválidos.",
            })
          }
        )}
        className="space-y-6"
      >

        <Input {...register('slug')} placeholder="Slug" />

        <Controller
          name="category"
          control={control}
          render={({ field }) => (
            <Select value={field.value || ""} onValueChange={field.onChange}>
              <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />

        {/* ✅ SUBCATEGORIA (voltou para cadastro e edição) */}
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
              <SelectTrigger><SelectValue placeholder="Marca" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="generico">Genérico</SelectItem>

                {brands
                  ?.filter((b) => b.slug !== "generico")
                  .map((b) => (
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

        <Textarea {...register('description')} placeholder="Descrição" />
        <Textarea {...register('benefits')} placeholder="Benefícios (1 por linha)" />
        <Input {...register('price_label')} placeholder="R$ 89,90" />

        <Label>URLs das imagens (1 por linha)</Label>
        <Textarea {...register('image_urls')} rows={3} />

        <div className="space-y-4">
          <h2 className="font-semibold">Links de Afiliado</h2>

          <Input {...register('shopee_link')} placeholder="Link Shopee" />
          <Input
            type="number"
            step="0.01"
            {...register('shopee_price', { setValueAs: (v) => (v === "" ? null : Number(v)) })}
            placeholder="Preço Shopee"
          />

          <Input {...register('mercadolivre_link')} placeholder="Link Mercado Livre" />
          <Input
            type="number"
            step="0.01"
            {...register('mercadolivre_price', { setValueAs: (v) => (v === "" ? null : Number(v)) })}
            placeholder="Preço Mercado Livre"
          />

          <Input {...register('amazon_link')} placeholder="Link Amazon" />
          <Input
            type="number"
            step="0.01"
            {...register('amazon_price', { setValueAs: (v) => (v === "" ? null : Number(v)) })}
            placeholder="Preço Amazon"
          />
        </div>

        <div className="space-y-2">
          <Label>Review (YouTube ou Instagram)</Label>
          <Input
            type="url"
            {...register("review_url")}
            placeholder="https://www.youtube.com/... ou https://www.instagram.com/..."
          />
          <p className="text-xs text-muted-foreground">
            Opcional. Ajuda quem está indeciso a comprar.
          </p>
        </div>

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : product ? 'Atualizar Produto' : 'Criar Produto'}
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

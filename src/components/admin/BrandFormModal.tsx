import { useEffect, useMemo, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateBrand, useUpdateBrand, Brand } from "@/hooks/useBrandsAdmin"
import { CATEGORY_LABELS } from "@/types/product"
import { useToast } from "@/hooks/use-toast"
import { getSupabase } from "@/integrations/supabase/client"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  brand?: Brand

  /** ✅ categoria atual do ProductForm (slug) */
  category?: string

  /** ✅ callback para o ProductForm atualizar o select imediatamente */
  onCreated?: (brand: Brand) => void
}

function BrandFormModal({ open, onOpenChange, brand, category: categoryProp, onCreated }: Props) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [featured, setFeatured] = useState(false)

  const createBrand = useCreateBrand()
  const updateBrand = useUpdateBrand()
  const { toast } = useToast()

  const isSaving = createBrand.isPending || updateBrand.isPending

  const slugify = (text: string) =>
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

  // ✅ quando abre:
  // - se for edição: carrega dados da marca
  // - se for criação: pré-seleciona a categoria do ProductForm
  useEffect(() => {
    if (!open) return

    if (brand) {
      setName(brand.name ?? "")
      setCategory(brand.category ?? "")
      setFeatured(Boolean(brand.is_featured))
      return
    }

    setName("")
    setFeatured(false)
    setCategory(categoryProp ?? "")
  }, [brand, open, categoryProp])

  const canSave = useMemo(() => {
    return Boolean(name.trim()) && Boolean(category.trim())
  }, [name, category])

  // ✅ busca a marca recém-criada/atualizada para garantir que temos id/slug corretos,
  // mesmo que o hook mutateAsync não retorne data
  async function fetchBrandBySlug(slug: string) {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from("brands")
      .select("id,name,slug,category,is_featured,logo_url,created_at,updated_at")
      .eq("slug", slug)
      .maybeSingle()

    if (error) throw error
    return data as unknown as Brand | null
  }

  const handleSave = async () => {
    if (!canSave) {
      toast({
        variant: "destructive",
        title: "Preencha os campos obrigatórios",
        description: "Informe o nome e selecione a categoria.",
      })
      return
    }

    const slug = slugify(name.trim())

    const payload = {
      name: name.trim(),
      slug,
      category: category.trim(), // ✅ slug da categoria (beleza, casa, etc)
      is_featured: featured,
    }

    try {
      if (brand) {
        await updateBrand.mutateAsync({ id: brand.id, ...payload })
      } else {
        await createBrand.mutateAsync(payload)
      }

      // ✅ garante objeto completo para o ProductForm setar brand_slug e refetch
      const fresh = await fetchBrandBySlug(slug)

      if (fresh) {
        onCreated?.(fresh)
      } else {
        // fallback mínimo: ainda dá pra setar slug no ProductForm
        onCreated?.({ ...(payload as any), id: (brand as any)?.id ?? "temp" } as Brand)
      }

      onOpenChange(false)

      toast({
        title: brand ? "Marca atualizada!" : "Marca criada!",
      })
    } catch (e) {
      console.error(e)
      toast({
        variant: "destructive",
        title: "Erro ao salvar marca",
        description: "Verifique se o nome já existe ou tente novamente.",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{brand ? "Editar Marca" : "Nova Marca"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da marca" />

          <Select value={category} onValueChange={setCategory}>
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

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} />
            Marca em destaque
          </label>

          <Button onClick={handleSave} className="w-full" disabled={!canSave || isSaving}>
            {isSaving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default BrandFormModal

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useCreateBrand, useUpdateBrand, Brand } from "@/hooks/useBrandsAdmin"
import { CATEGORY_LABELS } from "@/types/product"

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  brand?: Brand
}

function BrandFormModal({ open, onOpenChange, brand }: Props) {
  const [name, setName] = useState("")
  const [category, setCategory] = useState("")
  const [featured, setFeatured] = useState(false)

  const createBrand = useCreateBrand()
  const updateBrand = useUpdateBrand()

  useEffect(() => {
    if (brand) {
      setName(brand.name)
      setCategory(brand.category)
      setFeatured(brand.is_featured)
    } else {
      setName("")
      setCategory("")
      setFeatured(false)
    }
  }, [brand, open])

  const slugify = (text: string) =>
    text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  const handleSave = async () => {
    if (!name || !category) return

    const payload = {
      name,
      slug: slugify(name),
      category,
      is_featured: featured,
    }

    if (brand) await updateBrand.mutateAsync({ id: brand.id, ...payload })
    else await createBrand.mutateAsync(payload)

    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{brand ? "Editar Marca" : "Nova Marca"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nome da marca" />

          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={featured} onChange={e => setFeatured(e.target.checked)} />
            Marca em destaque
          </label>

          <Button onClick={handleSave} className="w-full">Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default BrandFormModal

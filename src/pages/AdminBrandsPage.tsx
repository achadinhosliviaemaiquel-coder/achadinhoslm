import { useState } from "react"
import { Layout } from "@/components/Layout"
import { Button } from "@/components/ui/button"
import { useBrandsAdmin, useDeleteBrand, Brand } from "@/hooks/useBrandsAdmin"
import BrandFormModal from "@/components/admin/BrandFormModal"
import { Trash2, Pencil } from "lucide-react"

export default function AdminBrandsPage() {
  const { data: brands = [] } = useBrandsAdmin()
  const deleteBrand = useDeleteBrand()

  const [selected, setSelected] = useState<Brand | undefined>()
  const [open, setOpen] = useState(false)

  return (
    <Layout>
      <div className="space-y-6 max-w-4xl mx-auto">

        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">Marcas</h1>
          <Button onClick={() => { setSelected(undefined); setOpen(true) }}>
            Nova Marca
          </Button>
        </div>

        <div className="grid gap-3">
          {brands.map(brand => (
            <div key={brand.id} className="flex justify-between items-center p-4 border rounded-xl">
              <div>
                <p className="font-medium">{brand.name}</p>
                <p className="text-sm text-muted-foreground">{brand.category}</p>
              </div>

              <div className="flex gap-2">
                <Button size="icon" variant="outline" onClick={() => { setSelected(brand); setOpen(true) }}>
                  <Pencil size={16} />
                </Button>
                <Button size="icon" variant="destructive" onClick={() => deleteBrand.mutate(brand.id)}>
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <BrandFormModal open={open} onOpenChange={setOpen} brand={selected} />
      </div>
    </Layout>
  )
}

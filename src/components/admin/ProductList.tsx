import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { ProductForm } from "./ProductForm"
import { useProducts, useDeleteProduct } from "@/hooks/useProducts"
import { useToast } from "@/hooks/use-toast"
import { CATEGORY_LABELS, type Product, type ProductCategory } from "@/types/product"
import { Skeleton } from "@/components/ui/skeleton"
import { Pencil, Trash2, ExternalLink, Loader2 } from "lucide-react"
import { getLowestPrice, formatCurrency } from "@/lib/utils"
import { getSupabase } from "@/integrations/supabase/client"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function ProductList({ categoryFilter }: { categoryFilter: ProductCategory | "all" }) {
  const [page, setPage] = useState(1)
  const { data, isLoading, refetch } = useProducts(categoryFilter, page)
  const deleteProduct = useDeleteProduct()
  const { toast } = useToast()
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // BULK
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [bulkCategory, setBulkCategory] = useState<ProductCategory | "">("")
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)

  const products = data?.products ?? []
  const totalPages = data?.totalPages ?? 1

  useEffect(() => {
    setPage(1)
    setSelectedIds([])
  }, [categoryFilter])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    )
  }

  const selectAll = () => {
    if (selectedIds.length === products.length) setSelectedIds([])
    else setSelectedIds(products.map((p) => p.id))
  }

  const handleBulkUpdate = async () => {
    if (!bulkCategory || selectedIds.length === 0) return
    setIsBulkUpdating(true)

    const supabase = getSupabase()

    const { error } = await supabase
      .from("products")
      .update({
        category: bulkCategory,
        subcategory: null,
        brand_slug: "generico",
      })
      .in("id", selectedIds)

    setIsBulkUpdating(false)

    if (error) {
      toast({ variant: "destructive", title: "Erro ao atualizar produtos" })
      return
    }

    toast({ title: "Produtos atualizados em massa!" })
    setSelectedIds([])
    setBulkCategory("")
    refetch()
  }

  const handleDelete = async (product: Product) => {
    try {
      await deleteProduct.mutateAsync(product.id)
      toast({ title: "Produto excluído" })
    } catch {
      toast({ variant: "destructive", title: "Erro ao excluir" })
    }
  }

  if (isLoading) {
    return <Skeleton className="h-40 w-full rounded-xl" />
  }

  return (
    <>
      {/* BULK BAR */}
      {selectedIds.length > 0 && (
        <div className="bg-muted p-4 rounded-xl flex gap-4 items-center mb-4">
          <span className="text-sm font-medium">{selectedIds.length} selecionados</span>

          <Select value={bulkCategory} onValueChange={(v) => setBulkCategory(v as ProductCategory)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Mover para categoria..." />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={handleBulkUpdate} disabled={!bulkCategory || isBulkUpdating}>
            {isBulkUpdating ? <Loader2 className="animate-spin" /> : "Atualizar em massa"}
          </Button>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={selectedIds.length === products.length} onChange={selectAll} />
          <span className="text-sm text-muted-foreground">Selecionar todos</span>
        </div>

        {products.map((product) => {
          const lowestPrice = getLowestPrice(product)

          return (
            <div key={product.id} className="bg-card rounded-xl p-4 shadow-soft flex gap-4 items-start justify-between">
              <input
                type="checkbox"
                checked={selectedIds.includes(product.id)}
                onChange={() => toggleSelect(product.id)}
              />

              <div className="flex gap-4 flex-1 min-w-0">
                <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
                  <img src={product.image_urls?.[0] || "/placeholder.svg"} className="w-full h-full object-cover" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <h3 className="font-semibold truncate">{product.name}</h3>
                  <Badge variant="secondary">{CATEGORY_LABELS[product.category]}</Badge>

                  {lowestPrice && (
                    <p className="text-sm font-semibold text-emerald-600">
                      A partir de {formatCurrency(lowestPrice)}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button variant="ghost" size="icon" asChild>
                  <Link to={`/product/${product.slug}`} state={{ from: "/admin" }}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>

                <Button variant="ghost" size="icon" onClick={() => setEditingProduct(product)}>
                  <Pencil className="h-4 w-4" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                      <AlertDialogDescription>{product.name}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(product)}>
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )
        })}
      </div>

      {/* PAGINAÇÃO */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-6">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => {
              const pageNumber = i + 1

              if (
                pageNumber === 1 ||
                pageNumber === totalPages ||
                Math.abs(pageNumber - page) <= 1
              ) {
                return (
                  <Button
                    key={pageNumber}
                    size="sm"
                    variant={page === pageNumber ? "default" : "outline"}
                    onClick={() => setPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                )
              }

              if (pageNumber === page - 2 || pageNumber === page + 2) {
                return <span key={pageNumber}>...</span>
              }

              return null
            })}
          </div>

          <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}

      {/* EDIT DIALOG */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          {editingProduct && <ProductForm product={editingProduct} onSuccess={() => setEditingProduct(null)} />}
        </DialogContent>
      </Dialog>
    </>
  )
}

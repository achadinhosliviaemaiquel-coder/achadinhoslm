import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ProductForm } from './ProductForm';
import { useProducts, useDeleteProduct } from '@/hooks/useProducts';
import { useToast } from '@/hooks/use-toast';
import { CATEGORY_LABELS, type Product } from '@/types/product';
import { Skeleton } from '@/components/ui/skeleton';
import { Pencil, Trash2, ExternalLink, Loader2 } from 'lucide-react';

export function ProductList() {
  const { data: products, isLoading } = useProducts();
  const deleteProduct = useDeleteProduct();
  const { toast } = useToast();
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleDelete = async (product: Product) => {
    try {
      await deleteProduct.mutateAsync(product.id);
      toast({
        title: 'Produto excluído',
        description: `"${product.name}" foi removido.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível excluir o produto.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-card rounded-xl p-4 flex gap-4">
            <Skeleton className="w-16 h-16 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!products || products.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <span className="text-4xl">📦</span>
        <p className="text-muted-foreground">
          Nenhum produto cadastrado ainda.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-card rounded-xl p-4 shadow-soft flex gap-4 items-start"
          >
            {/* Image */}
            <div className="w-16 h-16 rounded-lg overflow-hidden bg-muted flex-shrink-0">
              <img
                src={product.image_urls?.[0] || '/placeholder.svg'}
                alt={product.name}
                className="w-full h-full object-cover"
              />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="font-semibold text-foreground truncate">
                {product.name}
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[product.category]}
                </Badge>
                <span className="text-sm text-primary font-medium">
                  {product.price_label}
                </span>
              </div>
              <div className="flex gap-1 pt-1">
                {product.shopee_link && (
                  <span className="w-4 h-4 rounded-full bg-shopee flex items-center justify-center">
                    <span className="text-shopee-foreground text-[10px] font-bold">S</span>
                  </span>
                )}
                {product.mercadolivre_link && (
                  <span className="w-4 h-4 rounded-full bg-mercadolivre flex items-center justify-center">
                    <span className="text-mercadolivre-foreground text-[10px] font-bold">M</span>
                  </span>
                )}
                {product.amazon_link && (
                  <span className="w-4 h-4 rounded-full bg-amazon flex items-center justify-center">
                    <span className="text-amazon-foreground text-[10px] font-bold">A</span>
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                asChild
              >
                <Link to={`/product/${product.slug}`} target="_blank">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditingProduct(product)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir produto?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Tem certeza que deseja excluir "{product.name}"? Esta ação não pode ser desfeita.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDelete(product)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      {deleteProduct.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Excluir'
                      )}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={() => setEditingProduct(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <ProductForm
              product={editingProduct}
              onSuccess={() => setEditingProduct(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

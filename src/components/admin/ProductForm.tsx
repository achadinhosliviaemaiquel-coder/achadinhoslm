import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateProduct, useUpdateProduct } from '@/hooks/useProducts';
import { useToast } from '@/hooks/use-toast';
import { CATEGORY_LABELS, type Product, type ProductCategory } from '@/types/product';
import { Loader2 } from 'lucide-react';

const productSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  slug: z.string().min(1, 'Slug é obrigatório').regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  category: z.string().min(1, 'Categoria é obrigatória'),
  subcategory: z.string().optional(),
  description: z.string().optional(),
  benefits: z.string().optional(),
  price_label: z.string().min(1, 'Preço é obrigatório'),
  urgency_label: z.string().optional(),
  image_urls: z.string().optional(),
  shopee_link: z.string().url('URL inválida').optional().or(z.literal('')),
  mercadolivre_link: z.string().url('URL inválida').optional().or(z.literal('')),
  amazon_link: z.string().url('URL inválida').optional().or(z.literal('')),
});

type ProductFormData = z.infer<typeof productSchema>;

interface ProductFormProps {
  product?: Product;
  onSuccess?: () => void;
}

export function ProductForm({ product, onSuccess }: ProductFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: product ? {
      name: product.name,
      slug: product.slug,
      category: product.category,
      subcategory: product.subcategory || '',
      description: product.description || '',
      benefits: product.benefits?.join('\n') || '',
      price_label: product.price_label,
      urgency_label: product.urgency_label || '',
      image_urls: product.image_urls?.join('\n') || '',
      shopee_link: product.shopee_link || '',
      mercadolivre_link: product.mercadolivre_link || '',
      amazon_link: product.amazon_link || '',
    } : undefined,
  });

  const category = watch('category');

  const onSubmit = async (data: ProductFormData) => {
    setIsSubmitting(true);

    try {
      const productData = {
        name: data.name,
        slug: data.slug,
        category: data.category as ProductCategory,
        subcategory: data.subcategory || null,
        description: data.description || null,
        benefits: data.benefits?.split('\n').filter(Boolean) || [],
        price_label: data.price_label,
        urgency_label: data.urgency_label || null,
        image_urls: data.image_urls?.split('\n').filter(Boolean) || [],
        shopee_link: data.shopee_link || null,
        mercadolivre_link: data.mercadolivre_link || null,
        amazon_link: data.amazon_link || null,
        is_active: true,
      };

      if (product) {
        await updateProduct.mutateAsync({ id: product.id, ...productData });
        toast({
          title: 'Produto atualizado!',
          description: 'As alterações foram salvas.',
        });
      } else {
        await createProduct.mutateAsync(productData);
        toast({
          title: 'Produto criado!',
          description: 'O produto foi adicionado ao catálogo.',
        });
        reset();
      }

      onSuccess?.();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Ocorreu um erro ao salvar.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Auto-generate slug from name
  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const name = e.target.value;
    if (!product) {
      const slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setValue('slug', slug);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic info */}
      <div className="space-y-4">
        <h2 className="font-semibold text-foreground">Informações Básicas</h2>
        
        <div className="space-y-2">
          <Label htmlFor="name">Nome do Produto *</Label>
          <Input
            id="name"
            {...register('name')}
            onChange={(e) => {
              register('name').onChange(e);
              handleNameChange(e);
            }}
            placeholder="Ex: Vestido Floral Midi"
          />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="slug">Slug (URL) *</Label>
          <Input
            id="slug"
            {...register('slug')}
            placeholder="vestido-floral-midi"
          />
          {errors.slug && (
            <p className="text-sm text-destructive">{errors.slug.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Categoria *</Label>
            <Select value={category} onValueChange={(value) => setValue('category', value)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm text-destructive">{errors.category.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="subcategory">Subcategoria</Label>
            <Input
              id="subcategory"
              {...register('subcategory')}
              placeholder="Ex: Vestidos"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Descrição</Label>
          <Textarea
            id="description"
            {...register('description')}
            placeholder="Descreva o produto..."
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="benefits">Benefícios (um por linha)</Label>
          <Textarea
            id="benefits"
            {...register('benefits')}
            placeholder="Tecido leve e confortável&#10;Estampa exclusiva&#10;Forro completo"
            rows={4}
          />
        </div>
      </div>

      {/* Price and urgency */}
      <div className="space-y-4">
        <h2 className="font-semibold text-foreground">Preço e Urgência</h2>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="price_label">Preço (texto) *</Label>
            <Input
              id="price_label"
              {...register('price_label')}
              placeholder="R$ 89,90"
            />
            {errors.price_label && (
              <p className="text-sm text-destructive">{errors.price_label.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="urgency_label">Texto de Urgência</Label>
            <Input
              id="urgency_label"
              {...register('urgency_label')}
              placeholder="🔥 Últimas unidades!"
            />
          </div>
        </div>
      </div>

      {/* Images */}
      <div className="space-y-4">
        <h2 className="font-semibold text-foreground">Imagens</h2>
        
        <div className="space-y-2">
          <Label htmlFor="image_urls">URLs das imagens (uma por linha)</Label>
          <Textarea
            id="image_urls"
            {...register('image_urls')}
            placeholder="https://exemplo.com/imagem1.jpg&#10;https://exemplo.com/imagem2.jpg"
            rows={3}
          />
        </div>
      </div>

      {/* Affiliate links */}
      <div className="space-y-4">
        <h2 className="font-semibold text-foreground">Links de Afiliado</h2>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="shopee_link" className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-shopee flex items-center justify-center">
                <span className="text-shopee-foreground text-xs font-bold">S</span>
              </span>
              Link da Shopee
            </Label>
            <Input
              id="shopee_link"
              {...register('shopee_link')}
              placeholder="https://shope.ee/..."
            />
            {errors.shopee_link && (
              <p className="text-sm text-destructive">{errors.shopee_link.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="mercadolivre_link" className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-mercadolivre flex items-center justify-center">
                <span className="text-mercadolivre-foreground text-xs font-bold">M</span>
              </span>
              Link do Mercado Livre
            </Label>
            <Input
              id="mercadolivre_link"
              {...register('mercadolivre_link')}
              placeholder="https://produto.mercadolivre.com.br/..."
            />
            {errors.mercadolivre_link && (
              <p className="text-sm text-destructive">{errors.mercadolivre_link.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="amazon_link" className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-amazon flex items-center justify-center">
                <span className="text-amazon-foreground text-xs font-bold">A</span>
              </span>
              Link da Amazon
            </Label>
            <Input
              id="amazon_link"
              {...register('amazon_link')}
              placeholder="https://www.amazon.com.br/dp/..."
            />
            {errors.amazon_link && (
              <p className="text-sm text-destructive">{errors.amazon_link.message}</p>
            )}
          </div>
        </div>
      </div>

      {/* Submit */}
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Salvando...
          </>
        ) : product ? (
          'Atualizar Produto'
        ) : (
          'Criar Produto'
        )}
      </Button>
    </form>
  );
}

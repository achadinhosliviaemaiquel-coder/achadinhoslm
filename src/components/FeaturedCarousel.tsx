import useEmblaCarousel from 'embla-carousel-react'
import { ProductCard } from './ProductCard'
import type { Product } from '@/types/product'

export function FeaturedCarousel({ products }: { products: Product[] }) {
  const [emblaRef] = useEmblaCarousel({ align: 'start', dragFree: true })

  return (
    <div className="overflow-hidden" ref={emblaRef}>
      <div className="flex gap-4">
        {products.map((product) => (
          <div key={product.id} className="min-w-[70%] sm:min-w-[40%] lg:min-w-[25%]">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </div>
  )
}
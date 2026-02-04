import { useParams, useNavigate } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { ProductCard } from "@/components/ProductCard"
import { Skeleton } from "@/components/ui/skeleton"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function BrandPage() {
  const { brandSlug } = useParams<{ brandSlug: string }>()
  const navigate = useNavigate()

  const { data: products, isLoading } = useQuery({
    queryKey: ["brand-products", brandSlug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("brand_slug", brandSlug)
        .eq("is_active", true)

      if (error) throw error
      return data
    },
  })

  const brandName = brandSlug
    ? brandSlug.replace(/-/g, " ")
    : "Marca"

  return (
    <Layout
      breadcrumb={[
        { name: "Home", url: "/" },
        { name: "Marcas", url: "/brands" },
        { name: brandName, url: `/brand/${brandSlug}` },
      ]}
    >
      <div className="space-y-6">

        <Button
          variant="ghost"
          size="sm"
          className="w-fit px-2 -mb-2"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>

        <h1 className="text-xl font-bold capitalize">
          {brandName}
        </h1>

        {isLoading ? (
          <div className="flex justify-center">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 max-w-[1100px] w-full">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-52 rounded-xl" />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 max-w-[1100px] w-full">
              {products?.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}

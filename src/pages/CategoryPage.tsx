import { useParams, useNavigate, useLocation } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { useProductsByCategoryFull } from "@/hooks/useProductsByCategoryFull"
import { useBrands } from "@/hooks/useBrands"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ProductCard } from "@/components/ProductCard"
import { BrandCard } from "@/components/BrandCard"
import { List, Grid2x2, ArrowLeft } from "lucide-react"
import { useState, useMemo } from "react"
import { Helmet } from "react-helmet-async"
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product"

export default function CategoryPage() {
  const { category } = useParams<{ category: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})

  // ✅ normaliza e garante category válida (evita queries erradas + SEO estranho)
  const safeCategory = ((category || "").trim().toLowerCase() as ProductCategory) || ("casa" as ProductCategory)
  const categoryLabel = CATEGORY_LABELS[safeCategory] || "Categoria"

  // 🔥 HOOK CERTO — TRAZ TODOS PRODUTOS DA CATEGORIA (SEM PAGINAÇÃO)
  const { data: products = [], isLoading } = useProductsByCategoryFull(safeCategory)
  const { data: brands } = useBrands(safeCategory)

  // ✅ se existir ?sub=... não indexar (evita variações infinitas)
  const hasSubFilter = useMemo(() => {
    try {
      return new URLSearchParams(location.search).has("sub")
    } catch {
      return false
    }
  }, [location.search])

  /* ================= SEO SCHEMA ================= */

  // ✅ evita schema gigante quando tiver muitos itens
  const itemListSchema = useMemo(() => {
    const MAX_ITEMS = 200
    const list = (products || []).slice(0, MAX_ITEMS)

    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      itemListElement: list.map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `https://achadinhoslm.com.br/product/${p.slug}`,
      })),
    }
  }, [products])

  // 🔥 FAQ SCHEMA
  const faqSchema = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: `Qual o melhor produto de ${categoryLabel}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `O melhor produto de ${categoryLabel} depende do seu objetivo. Selecionamos opções com melhor avaliação, preço competitivo e boa reputação de venda.`,
          },
        },
        {
          "@type": "Question",
          name: `Como escolher um bom produto de ${categoryLabel}?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Considere qualidade, avaliações, custo-benefício e se o produto atende sua necessidade específica. Sempre compare antes de comprar.`,
          },
        },
        {
          "@type": "Question",
          name: `Vale a pena comprar ${categoryLabel} online?`,
          acceptedAnswer: {
            "@type": "Answer",
            text: `Sim. Comprar ${categoryLabel} online permite comparar preços, ler avaliações e encontrar promoções exclusivas.`,
          },
        },
      ],
    }),
    [categoryLabel]
  )

  /* ================= LÓGICA ORIGINAL ================= */

  const normalizeSub = (value?: string) => {
    if (!value) return "outros"
    return value.toLowerCase().trim().replace(/\s+/g, "-").replace(/_/g, "-")
  }

  const groupedProducts = products.reduce<Record<string, typeof products>>((acc, product) => {
    const key = normalizeSub(product.subcategory)
    if (!acc[key]) acc[key] = []
    acc[key].push(product)
    return acc
  }, {})

  // ordenar cada grupo por data
  Object.keys(groupedProducts).forEach((key) => {
    groupedProducts[key].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  })

  const SECTION_LABELS: Record<string, Record<string, string>> = {
    casa: {
      organizacao: "📦 Organização",
      banho: "🚿 Banho",
      cozinha: "🍳 Cozinha",
      limpeza: "🧼 Limpeza",
      decoracao: "🪴 Decoração",
      cama: "🛏️ Quarto",
      lavanderia: "🧺 Lavanderia",
    },
    beleza: {
      hidratante: "💧 Hidratantes",
      shampoo: "🧼 Cuidados com o Cabelo",
      "protetor-solar": "☀️ Protetor Solar",
      creme: "💆 Cremes",
      locao: "🧴 Loções e Tratamentos",
      kit: "🎁 Kits Especiais",
      "limpeza-facial": "🫧 Limpeza Facial",
    },
    moda: {
      vestidos: "👗 Vestidos",
      acessorios: "👜 Acessórios",
      intimos: "🧦 Roupas Íntimas",
      academia: "🏋️ Moda Fitness",
      calcados: "👟 Calçados",
    },
    infantil: {
      brinquedos: "🧸 Brinquedos",
      roupas: "👕 Roupas Infantis",
      "calcados-infantis": "👟 Calçados Infantis",
      cuidados: "🍼 Cuidados com Bebê",
    },
    pets: {
      racao: "🍖 Ração",
      brinquedos: "🐾 Brinquedos",
      remedios: "💊 Saúde Pet",
      higiene: "🛁 Higiene",
      armazenamento: "📦 Armazenamento",
    },
    escritorio: {
      papelaria: "✏️ Papelaria",
      organizacao: "🗂️ Organização",
      mochilas: "🎒 Mochilas e Estojos",
      tecnologia: "💻 Acessórios Tech",
    },
    eletronicos: {
      audio: "🎧 Áudio",
      imagem: "📽️ Imagem e Vídeo",
      seguranca: "🔐 Segurança",
      automotivo: "🚗 Tecnologia Automotiva",
      acessorios: "🔌 Acessórios",
    },
    eletrodomesticos: {
      cozinha: "🍳 Cozinha Elétrica",
      limpeza: "🧹 Limpeza",
      cafe: "☕ Café",
      climatizacao: "❄️ Climatização",
    },
    suplementos: {
      whey: "🥛 Whey Protein",
      creatina: "⚡ Creatina",
      pretreino: "🔥 Pré-Treino",
      vitaminas: "💊 Vitaminas",
    },
  }

  const toggleExpand = (sub: string) => {
    setExpandedSections((prev) => ({ ...prev, [sub]: !prev[sub] }))
  }

  return (
    <Layout
      breadcrumb={[
        { name: "Home", url: "/" },
        { name: categoryLabel, url: `/category/${safeCategory}` },
      ]}
      seo={{
        title: `${categoryLabel} em Promoção | Ofertas e Achadinhos Baratos`,
        description: `Veja ofertas de ${categoryLabel.toLowerCase()} com preço baixo na Shopee, Amazon e Mercado Livre.`,
        canonical: `/category/${safeCategory}`, // ✅ evita /category/undefined e mantém canonical estável
        ogImage: "/og-home.jpg",
        ogType: "website",
        noindex: hasSubFilter,
      }}
    >
      <Helmet>
        <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
        <script type="application/ld+json">{JSON.stringify(faqSchema)}</script>
      </Helmet>

      <div className="space-y-6">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="text-xl font-bold text-center flex-1">{categoryLabel} em Promoção</h1>

          <div className="flex gap-2">
            <Button variant={viewMode === "grid" ? "default" : "outline"} size="icon" onClick={() => setViewMode("grid")}>
              <Grid2x2 className="h-4 w-4" />
            </Button>
            <Button variant={viewMode === "list" ? "default" : "outline"} size="icon" onClick={() => setViewMode("list")}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* MARCAS */}
        {brands && brands.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Marcas em destaque</h2>
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-3">
              {brands.map((brand) => (
                <BrandCard
                  key={brand.slug}
                  category={safeCategory}
                  name={brand.name}
                  logo={brand.logo_url || `/brands/${brand.slug}.png`}
                  slug={brand.slug}
                  count={brand.product_count}
                />
              ))}
            </div>
          </section>
        )}

        {/* EMPTY */}
        {!isLoading && products.length === 0 && (
          <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3 shadow-soft">
            <div className="text-3xl">📦</div>
            <h2 className="text-lg font-semibold">Ainda não temos produtos aqui</h2>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-xl" />
            ))}
          </div>
        ) : products.length > 0 ? (
          <div className="space-y-8">
            {Object.entries(groupedProducts).map(([sub, items]) => {
              const label =
                SECTION_LABELS[safeCategory]?.[sub] || sub.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())

              const isExpanded = expandedSections[sub]
              const INITIAL_LIMIT = 4
              const visibleItems = isExpanded ? items : items.slice(0, INITIAL_LIMIT)

              return (
                <section key={sub} className="space-y-3">
                  <h2 className="text-lg font-semibold">{label}</h2>

                  <div className="w-full flex justify-center">
                    <div
                      className={
                        viewMode === "grid"
                          ? "grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 max-w-[1100px] w-full"
                          : "flex flex-col gap-4 w-full max-w-[900px]"
                      }
                    >
                      {visibleItems.map((product) => (
                        <ProductCard key={product.id} product={product} />
                      ))}
                    </div>
                  </div>

                  {items.length > 8 && (
                    <div className="flex justify-center">
                      <Button variant="outline" onClick={() => toggleExpand(sub)}>
                        {isExpanded ? "Ver menos" : "Ver mais"}
                      </Button>
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        ) : null}

        {/* TEXTO SEO FINAL */}
        <section className="text-sm text-muted-foreground max-w-3xl mx-auto text-center pt-10">
          Encontre produtos da categoria {categoryLabel.toLowerCase()} em promoção e produtos baratos nos principais marketplaces. O
          Achadinhos LM reúne ofertas atualizadas para você pagar menos.
        </section>
      </div>
    </Layout>
  )
}

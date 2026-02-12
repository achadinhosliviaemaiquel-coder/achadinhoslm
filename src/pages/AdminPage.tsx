import AdminBrandsPanel from "@/components/admin/AdminBrandsPanel"
import ClicksDashboard from "@/components/admin/ClicksDashboard"
import { useEffect, useMemo, useState } from "react"
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom"
import { Layout } from "@/components/Layout"
import { ProductForm } from "@/components/admin/ProductForm"
import { ProductList } from "@/components/admin/ProductList"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useAuth } from "@/hooks/useAuth"
import {
  Loader2,
  LogOut,
  Plus,
  List,
  BarChart3,
  Rocket,
  Database,
  Globe,
  MousePointerClick,
  Tag,
} from "lucide-react"
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product"

type AdminTab = "list" | "add" | "brands" | "clicks"
type Traffic = "all" | "organic" | "ads"

function isAdminTab(v: string | null): v is AdminTab {
  return v === "list" || v === "add" || v === "brands" || v === "clicks"
}

function isTraffic(v: string | null): v is Traffic {
  return v === "all" || v === "organic" || v === "ads"
}

export default function AdminPage() {
  const { user, isAdmin, loading, signOut } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // URL -> estado (fonte de verdade)
  const activeTab: AdminTab = useMemo(() => {
    const t = searchParams.get("tab")
    return isAdminTab(t) ? t : "list"
  }, [searchParams])

  const traffic: Traffic = useMemo(() => {
    const m = searchParams.get("traffic")
    return isTraffic(m) ? m : "all"
  }, [searchParams])

  // Estado local (somente para listagem)
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all")
  const [page, setPage] = useState(1)

  const handleCategoryChange = (category: ProductCategory | "all") => {
    setActiveCategory(category)
    setPage(1)
  }

  // Normalizações de URL:
  // 1) /admin -> /admin?tab=list
  // 2) tab inválida -> /admin?tab=list
  // 3) se tab != clicks, remove traffic
  // 4) se tab=clicks e traffic inválido/ausente, seta traffic=all
  useEffect(() => {
    const t = searchParams.get("tab")
    const isTabValid = isAdminTab(t)

    if (!t) {
      setSearchParams({ tab: "list" }, { replace: true })
      return
    }

    if (!isTabValid) {
      setSearchParams({ tab: "list" }, { replace: true })
      return
    }

    if (t !== "clicks" && searchParams.has("traffic")) {
      const next = new URLSearchParams(searchParams)
      next.delete("traffic")
      setSearchParams(next, { replace: true })
      return
    }

    if (t === "clicks" && !isTraffic(searchParams.get("traffic"))) {
      const next = new URLSearchParams(searchParams)
      next.set("traffic", "all")
      setSearchParams(next, { replace: true })
      return
    }
  }, [searchParams, setSearchParams])

  const setTab = (tab: AdminTab) => {
    const next = new URLSearchParams(searchParams)
    next.set("tab", tab)
    if (tab !== "clicks") next.delete("traffic")
    if (tab === "clicks" && !isTraffic(next.get("traffic"))) next.set("traffic", "all")
    setSearchParams(next, { replace: true })
  }

  const setTraffic = (t: Traffic) => {
    const next = new URLSearchParams(searchParams)
    next.set("tab", "clicks")
    next.set("traffic", t)
    setSearchParams(next, { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <span className="text-4xl">🚫</span>
          <h1 className="text-xl font-semibold text-foreground">Acesso Restrito</h1>
          <p className="text-muted-foreground">Você não tem permissão para acessar esta área.</p>
          <div className="flex gap-2 justify-center">
            <Button asChild variant="outline">
              <Link to="/">Voltar ao site</Link>
            </Button>
            <Button onClick={signOut} variant="ghost">
              <LogOut className="h-4 w-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <Layout showFooter={false}>
      <div className="space-y-8">
        {/* HEADER */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Painel Admin</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus produtos</p>
          </div>
          <Button onClick={signOut} variant="ghost" size="sm">
            <LogOut className="h-4 w-4 mr-2" />
            Sair
          </Button>
        </div>

        {/* ATALHOS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button asChild variant="secondary" className="justify-start gap-2">
            <a href="https://analytics.google.com" target="_blank" rel="noreferrer">
              <BarChart3 className="h-4 w-4" /> Analytics
            </a>
          </Button>
          <Button asChild variant="secondary" className="justify-start gap-2">
            <a href="https://vercel.com" target="_blank" rel="noreferrer">
              <Rocket className="h-4 w-4" /> Vercel
            </a>
          </Button>
          <Button asChild variant="secondary" className="justify-start gap-2">
            <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
              <Database className="h-4 w-4" /> Supabase
            </a>
          </Button>
          <Button asChild variant="secondary" className="justify-start gap-2">
            <a href="/" target="_blank" rel="noreferrer">
              <Globe className="h-4 w-4" /> Ver Site
            </a>
          </Button>
        </div>

        {/* TABS */}
        <Tabs value={activeTab} onValueChange={(v) => setTab(v as AdminTab)}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" /> Produtos
            </TabsTrigger>

            <TabsTrigger value="add" className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Adicionar
            </TabsTrigger>

            <TabsTrigger value="brands" className="flex items-center gap-2">
              <Tag className="h-4 w-4" /> Marcas
            </TabsTrigger>

            <TabsTrigger value="clicks" className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4" /> Métricas
            </TabsTrigger>
          </TabsList>

          {/* LIST */}
          <TabsContent value="list" className="mt-6 space-y-6">
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={activeCategory === "all" ? "default" : "outline"}
                onClick={() => handleCategoryChange("all")}
              >
                Todos
              </Button>

              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <Button
                  key={key}
                  size="sm"
                  variant={activeCategory === key ? "default" : "outline"}
                  onClick={() => handleCategoryChange(key as ProductCategory)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <ProductList categoryFilter={activeCategory} page={page} setPage={setPage} />
          </TabsContent>

          {/* ADD */}
          <TabsContent value="add" className="mt-6">
            <ProductForm
              onSuccess={() => {
                navigate({ pathname: "/admin", search: "?tab=list" })
              }}
            />
          </TabsContent>

          {/* BRANDS */}
          <TabsContent value="brands" className="mt-6">
            <AdminBrandsPanel />
          </TabsContent>

          {/* CLICKS / MÉTRICAS */}
          <TabsContent value="clicks" className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant={traffic === "all" ? "default" : "outline"} onClick={() => setTraffic("all")}>
                All
              </Button>
              <Button
                size="sm"
                variant={traffic === "organic" ? "default" : "outline"}
                onClick={() => setTraffic("organic")}
              >
                Orgânico
              </Button>
              <Button size="sm" variant={traffic === "ads" ? "default" : "outline"} onClick={() => setTraffic("ads")}>
                Ads
              </Button>
            </div>

            <ClicksDashboard traffic={traffic} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  )
}

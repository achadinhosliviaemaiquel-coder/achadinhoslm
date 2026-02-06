import { useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ProductForm } from "@/components/admin/ProductForm";
import { ProductList } from "@/components/admin/ProductList";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product";
import ClicksDashboard from "@/components/admin/ClicksDashboard";

export default function AdminPage() {
  const { user, isAdmin, loading, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState("list");
  const [activeCategory, setActiveCategory] = useState<ProductCategory | "all">("all");
  const [page, setPage] = useState(1); // ⭐ PAGINAÇÃO

  // Resetar página ao trocar categoria
  const handleCategoryChange = (category: ProductCategory | "all") => {
    setActiveCategory(category);
    setPage(1);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

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
    );
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
            <a href="https://app.netlify.com" target="_blank" rel="noreferrer">
              <Rocket className="h-4 w-4" /> Netlify
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

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" /> Produtos
            </TabsTrigger>
            <TabsTrigger value="add" className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Adicionar
            </TabsTrigger>
            <TabsTrigger value="clicks" className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4" /> Cliques
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-6 space-y-6">
            {/* FILTRO */}
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

            {/* LISTA COM PAGINAÇÃO */}
            <ProductList categoryFilter={activeCategory} page={page} setPage={setPage} />
          </TabsContent>

          <TabsContent value="add" className="mt-6">
            <ProductForm onSuccess={() => setActiveTab("list")} />
          </TabsContent>

          <TabsContent value="clicks" className="mt-6">
            <ClicksDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}

import "./index.css"
import { useEffect, lazy, Suspense } from "react"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { initGA4 } from "@/lib/analytics"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes — Q32
      gcTime: 1000 * 60 * 10,
    },
  },
})

// Q34: Lazy loading de todas as rotas para reduzir bundle inicial
const Index = lazy(() => import("./pages/Index"))
const ProductPage = lazy(() => import("./pages/ProductPage"))
const CategoryPage = lazy(() => import("./pages/CategoryPage"))
const BridgePage = lazy(() => import("./pages/BridgePage"))
const LoginPage = lazy(() => import("./pages/LoginPage"))
const AdminPage = lazy(() => import("./pages/AdminPage"))
const NotFound = lazy(() => import("./pages/NotFound"))
const SearchPage = lazy(() => import("@/pages/SearchPage"))
const BrandPage = lazy(() => import("@/pages/BrandPage"))
const ReviewsPage = lazy(() => import("@/pages/ReviewsPage")) // Q59

const App = () => {
  useEffect(() => {
    initGA4()
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
              <div className="animate-pulse text-muted-foreground text-sm">Carregando...</div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/product/:slug" element={<ProductPage />} />
              <Route path="/brand/:brandSlug" element={<BrandPage />} />
              <Route path="/:category/marca/:brandSlug" element={<BrandPage />} />
              <Route path="/category/:category" element={<CategoryPage />} />
              <Route path="/go/:store/:slug" element={<BridgePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/reviews" element={<ReviewsPage />} /> {/* Q59 */}
              <Route path="/login" element={<LoginPage />} />
              {/* 🔒 ADMIN */}
              <Route path="/admin" element={<AdminPage />} />
              {/* ✅ Compatibilidade: rota antiga vira redirect */}
              <Route path="/admin/brands" element={<Navigate to="/admin?tab=brands" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App

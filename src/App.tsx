import "./index.css"
import { useEffect } from 'react'
import { Toaster } from "@/components/ui/toaster"
import { Toaster as Sonner } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { initGA4 } from '@/lib/analytics'

import Index from "./pages/Index"
import ProductPage from "./pages/ProductPage"
import CategoryPage from "./pages/CategoryPage"
import BridgePage from "./pages/BridgePage"
import LoginPage from "./pages/LoginPage"
import AdminPage from "./pages/AdminPage"
import NotFound from "./pages/NotFound"
import SearchPage from "@/pages/SearchPage"
import BrandPage from "@/pages/BrandPage"

/* 🆕 ADMIN MARCAS */
import AdminBrandsPage from "./pages/AdminBrandsPage"

const queryClient = new QueryClient()

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
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/product/:slug" element={<ProductPage />} />
            <Route path="/:category/marca/:brandSlug" element={<BrandPage />} />
            <Route path="/category/:category" element={<CategoryPage />} />
            <Route path="/category/:category/:subcategory" element={<CategoryPage />} />
            <Route path="/go/:store/:slug" element={<BridgePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/login" element={<LoginPage />} />

            {/* 🔒 ADMIN */}
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/admin/brands" element={<AdminBrandsPage />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>

      </TooltipProvider>
    </QueryClientProvider>
  )
}

export default App
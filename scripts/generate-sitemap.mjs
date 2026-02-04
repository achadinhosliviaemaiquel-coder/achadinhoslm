import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SITE_URL = "https://achadinhoslm.com.br";

/**
 * Vercel já fornece variáveis de ambiente.
 * Funciona tanto local (.env) quanto produção.
 */
const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;

const SUPABASE_ANON_KEY =
  process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Variáveis do Supabase não definidas.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================================
   BUSCAR PRODUTOS ATIVOS
================================ */
const { data: products, error } = await supabase
  .from("products")
  .select("slug, updated_at")
  .eq("is_active", true);

if (error) {
  console.error("Erro ao buscar produtos:", error);
  process.exit(1);
}

/* ================================
   PÁGINAS ESTÁTICAS
================================ */
const staticPages = [
  "",
  "/category/beleza",
  "/category/casa",
  "/category/eletronicos",
  "/category/eletrodomesticos",
  "/category/moda",
  "/category/infantil",
  "/category/pets",
  "/category/escritorio",
  "/category/suplementos",
];

/* ================================
   GERAR URLs
================================ */
const urls = [
  ...staticPages.map(
    (path) => `
  <url>
    <loc>${SITE_URL}${path}</loc>
    <changefreq>daily</changefreq>
    <priority>${path === "" ? "1.0" : "0.8"}</priority>
  </url>`
  ),

  ...products.map(
    (p) => `
  <url>
    <loc>${SITE_URL}/product/${p.slug}</loc>
    <lastmod>${new Date(p.updated_at).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`
  ),
];

/* ================================
   GERAR XML
================================ */
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

/* ================================
   SALVAR ARQUIVO
================================ */
fs.writeFileSync("./public/sitemap.xml", sitemap);

console.log("✅ Sitemap gerado com sucesso!");

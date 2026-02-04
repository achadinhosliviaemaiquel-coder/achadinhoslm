import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const SITE_URL = "https://achadinhoslm.com.br";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const { data: products, error } = await supabase
  .from("products")
  .select("slug, updated_at")
  .eq("is_active", true);

if (error) {
  console.error("Erro ao buscar produtos:", error);
  process.exit(1);
}

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

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

fs.writeFileSync("./public/sitemap.xml", sitemap);
console.log("✅ Sitemap gerado com sucesso!");

// api/sitemap.xml.ts - Sitemap dinâmico gerado a partir do Supabase
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SITE_URL = "https://achadinhoslm.com.br";
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CATEGORIES = [
  "beleza",
  "casa",
  "eletrodomesticos",
  "eletronicos",
  "escritorio",
  "infantil",
  "moda",
  "pets",
  "suplementos",
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    const { data: products, error } = await supabase
      .from("products")
      .select("slug, updated_at")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const today = new Date().toISOString().split("T")[0];

    const staticUrls = [
      `  <url><loc>${SITE_URL}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>1.0</priority></url>`,
      ...CATEGORIES.map(
        (c) =>
          `  <url><loc>${SITE_URL}/category/${c}</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq><priority>0.8</priority></url>`,
      ),
    ];

    const productUrls = (products ?? []).map((p) => {
      const lastmod = (p.updated_at || today).split("T")[0];
      return `  <url><loc>${SITE_URL}/product/${p.slug}</loc><lastmod>${lastmod}</lastmod><changefreq>weekly</changefreq><priority>0.6</priority></url>`;
    });

    const xml = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...staticUrls,
      ...productUrls,
      `</urlset>`,
    ].join("\n");

    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(xml);
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || "Unknown error" });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

function getServerSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

// Cache simples em memória (serverless: melhor esforço)
let cachedCols: Set<string> | null = null
let cachedAt = 0

async function getProductClicksColumns(supabase: ReturnType<typeof createClient>) {
  const now = Date.now()
  if (cachedCols && now - cachedAt < 5 * 60 * 1000) return cachedCols // 5 min

  const { data, error } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", "product_clicks")

  if (error) {
    // Se não conseguir ler schema, cai no mínimo (não quebra tracking)
    console.error("[/api/intent] Failed to read schema columns:", error)
    return new Set<string>(["product_id", "store"])
  }

  const cols = new Set<string>((data ?? []).map((r: any) => String(r.column_name)))
  cachedCols = cols
  cachedAt = now
  return cols
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store")

  const supabase = getServerSupabase()
  if (!supabase) {
    console.error("[/api/intent] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return res.status(204).end()
  }

  try {
    const product_id = String(req.query.product_id || "")
    const store = String(req.query.store || "")

    const product_slug = String(req.query.product_slug || "")
    const category = String(req.query.category || "")

    const priceRaw = req.query.price
    const price = typeof priceRaw === "string" && priceRaw.trim() !== "" ? Number(priceRaw) : null

    if (!product_id || !store) {
      return res.status(400).send("Missing params")
    }

    const cols = await getProductClicksColumns(supabase)

    // Monta payload apenas com colunas que EXISTEM
    const payload: Record<string, any> = {}

    if (cols.has("product_id")) payload.product_id = product_id
    if (cols.has("store")) payload.store = store

    if (cols.has("product_slug")) payload.product_slug = product_slug || null
    if (cols.has("category")) payload.category = category || null

    if (cols.has("price")) payload.price = price !== null && Number.isFinite(price) ? price : null

    if (cols.has("user_agent")) payload.user_agent = req.headers["user-agent"] ?? null
    if (cols.has("referer")) payload.referer = req.headers["referer"] ?? null

    if (cols.has("created_at")) payload.created_at = new Date().toISOString()

    const { error } = await supabase.from("product_clicks").insert(payload)

    if (error) console.error("[/api/intent] Supabase insert intent error:", error)
  } catch (e) {
    console.error("[/api/intent] Error:", e)
  }

  return res.status(204).end()
}

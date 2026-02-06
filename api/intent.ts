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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getServerSupabase()
  if (!supabase) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    // Não quebra UX
    res.setHeader("Cache-Control", "no-store")
    return res.status(204).end()
  }

  try {
    const product_id = String(req.query.product_id || "")
    const store = String(req.query.store || "")
    const product_slug = String(req.query.product_slug || "")
    const category = String(req.query.category || "")

    const priceRaw = req.query.price
    const price =
      typeof priceRaw === "string" && priceRaw.trim() !== ""
        ? Number(priceRaw)
        : null

    if (!product_id || !store) {
      return res.status(400).send("Missing params")
    }

    const { error } = await supabase.from("product_clicks").insert({
      product_id,
      store,
      product_slug: product_slug || null,
      category: category || null,
      price: price !== null && Number.isFinite(price) ? price : null,
      user_agent: req.headers["user-agent"] ?? null,
      referer: req.headers["referer"] ?? null,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error("Supabase insert intent error:", error)
      // Não quebra UX
    }

    res.setHeader("Cache-Control", "no-store")
    return res.status(204).end()
  } catch (e) {
    console.error("Erro ao registrar intent:", e)
    // Não quebra UX
    res.setHeader("Cache-Control", "no-store")
    return res.status(204).end()
  }
}

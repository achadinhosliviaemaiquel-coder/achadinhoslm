import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const product_id = String(req.query.product_id || "")
    const store = String(req.query.store || "")
    const product_slug = String(req.query.product_slug || "")
    const category = String(req.query.category || "")
    const price = req.query.price ? Number(req.query.price) : null

    if (!product_id || !store) {
      return res.status(400).send("Missing params")
    }

    await supabase.from("product_clicks").insert({
      product_id,
      store,
      product_slug: product_slug || null,
      category: category || null,
      price: Number.isFinite(price as any) ? price : null,
      user_agent: req.headers["user-agent"] ?? null,
      referer: req.headers["referer"] ?? null,
      created_at: new Date().toISOString(),
    })

    res.setHeader("Cache-Control", "no-store")
    return res.status(204).end()
  } catch (e) {
    console.error("Erro ao registrar intent:", e)
    // Não quebra UX
    return res.status(204).end()
  }
}

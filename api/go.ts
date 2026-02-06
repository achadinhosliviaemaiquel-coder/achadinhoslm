import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // ⚠️ SERVER ONLY
  { auth: { persistSession: false } }
)

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = String(req.query.url || "")
  const product_id = String(req.query.product_id || "")
  const store = String(req.query.store || "")

  if (!url || !product_id || !store) {
    return res.status(400).send("Missing params")
  }

  try {
    // ✅ registra saída real (server-side, nunca é abortado)
    await supabase.from("product_outbounds").insert({
      product_id,
      store,
      url,
      user_agent: req.headers["user-agent"] ?? null,
      referer: req.headers["referer"] ?? null,
      created_at: new Date().toISOString(),
    })
  } catch (e) {
    console.error("Erro ao registrar outbound:", e)
    // ⚠️ não bloqueia o redirect (conversão > tracking)
  }

  res.setHeader("Cache-Control", "no-store")
  res.writeHead(302, { Location: url })
  return res.end()
}

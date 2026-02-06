import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient } from "@supabase/supabase-js"

function getServerSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const product_id =
    String((req.query.product_id as string) || "") ||
    String((req.body?.product_id as string) || "")

  const session_id =
    String((req.query.session_id as string) || "") ||
    String((req.body?.session_id as string) || "")

  if (!product_id) return res.status(400).send("Missing product_id")

  const supabase = getServerSupabase()
  if (!supabase) {
    console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY")
    res.setHeader("Cache-Control", "no-store")
    return res.status(204).end()
  }

  try {
    // Dedupe: mesma sessão + produto nos últimos 30 min
    if (session_id) {
      const { data, error } = await supabase
        .from("product_views")
        .select("id")
        .eq("product_id", product_id)
        .eq("session_id", session_id)
        .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1)

      if (!error && data && data.length > 0) {
        res.setHeader("Cache-Control", "no-store")
        return res.status(204).end()
      }
    }

    const { error } = await supabase.from("product_views").insert({
      product_id,
      session_id: session_id || null,
      user_agent: req.headers["user-agent"] ?? null,
      referer: req.headers["referer"] ?? null,
      created_at: new Date().toISOString(),
    })

    if (error) console.error("Supabase insert view error:", error)
  } catch (e) {
    console.error("Erro ao registrar view:", e)
  }

  res.setHeader("Cache-Control", "no-store")
  return res.status(204).end()
}

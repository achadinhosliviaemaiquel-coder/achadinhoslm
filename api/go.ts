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

function isSafeHttpUrl(raw: string) {
  try {
    const u = new URL(raw)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = String(req.query.url || "")
  const product_id = String(req.query.product_id || "")
  const store = String(req.query.store || "")

  if (!url || !product_id || !store) {
    return res.status(400).send("Missing params")
  }

  // Anti-abuso básico: evita redirect para javascript:, data:, etc.
  if (!isSafeHttpUrl(url)) {
    return res.status(400).send("Invalid url")
  }

  const supabase = getServerSupabase()
  if (!supabase) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    // Não trava a conversão: redireciona mesmo assim
    res.setHeader("Cache-Control", "no-store")
    res.writeHead(302, { Location: url })
    return res.end()
  }

  try {
    const { error } = await supabase.from("product_outbounds").insert({
      product_id,
      store,
      url,
      user_agent: req.headers["user-agent"] ?? null,
      referer: req.headers["referer"] ?? null,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.error("Supabase insert outbound error:", error)
    }
  } catch (e) {
    console.error("Erro ao registrar outbound:", e)
    // não bloqueia o redirect
  }

  res.setHeader("Cache-Control", "no-store")
  res.writeHead(302, { Location: url })
  return res.end()
}

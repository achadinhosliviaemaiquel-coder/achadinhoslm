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

function unwrapNestedGoUrl(raw: string): string {
  let current = (raw || "").trim()

  for (let i = 0; i < 2; i++) {
    if (!current) break

    const isGo =
      current.startsWith("/api/go") ||
      (current.includes("://") &&
        (() => {
          try {
            const u = new URL(current)
            return u.pathname === "/api/go"
          } catch {
            return false
          }
        })())

    if (!isGo) break

    try {
      const u = new URL(current, "https://dummy.local")
      const inner = u.searchParams.get("url")
      if (!inner) return ""
      current = decodeURIComponent(inner)
    } catch {
      return ""
    }
  }

  return current
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
  const rawUrl = String(req.query.url || "")
  const product_id = String(req.query.product_id || "")
  const store = String(req.query.store || "")

  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade")

  if (!rawUrl || !product_id || !store) {
    return res.status(400).send("Missing params")
  }

  const finalUrl = unwrapNestedGoUrl(rawUrl)
  if (!finalUrl || !isSafeHttpUrl(finalUrl)) {
    return res.status(400).send("Invalid url")
  }

  const supabase = getServerSupabase()
  if (!supabase) {
    console.error("[/api/go] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    res.setHeader("X-Tracking-Outbound", "0")
    res.writeHead(302, { Location: finalUrl })
    return res.end()
  }

  let tracked = false
  try {
    const { error } = await supabase.from("product_outbounds").insert({
      product_id,
      store,
      user_agent: req.headers["user-agent"] ?? null,
      created_at: new Date().toISOString(),
    })

    tracked = !error
    if (error) console.error("[/api/go] Supabase insert outbound error:", error)
  } catch (e) {
    console.error("[/api/go] Error:", e)
  }

  res.setHeader("X-Tracking-Outbound", tracked ? "1" : "0")
  res.writeHead(302, { Location: finalUrl })
  return res.end()
}

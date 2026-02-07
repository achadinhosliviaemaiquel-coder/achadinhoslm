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

function isUuidLike(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
}

type AllowedStore = "mercadolivre" | "shopee" | "amazon"
function normalizeStore(v: string): AllowedStore | null {
  const s = (v || "").trim().toLowerCase()
  if (s === "mercadolivre" || s === "shopee" || s === "amazon") return s
  return null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ---- NEW MODE: /api/go?offer_id=123
  const offer_id_raw = String(req.query.offer_id || "").trim()

  // ---- LEGACY MODE: /api/go?url=...&product_id=...&store=...
  const rawUrl = String(req.query.url || "")
  const product_id_raw = String(req.query.product_id || "")
  const store_raw = String(req.query.store || "")

  // ---- shared
  const session_id = String(req.query.session_id || "") || null
  const referer = req.headers.referer ?? null

  res.setHeader("Cache-Control", "no-store")
  res.setHeader("Referrer-Policy", "no-referrer-when-downgrade")

  const supabase = getServerSupabase()
  const nowIso = new Date().toISOString()

  const redirect = (to: string, trackedHeader: "1" | "0") => {
    res.setHeader("X-Tracking-Outbound", trackedHeader)
    res.writeHead(302, { Location: to })
    return res.end()
  }

  // ===========================
  // MODE A: offer_id
  // ===========================
  if (offer_id_raw) {
    const offer_id_num = Number(offer_id_raw)
    if (!Number.isFinite(offer_id_num) || offer_id_num <= 0) {
      return res.status(400).send("Invalid offer_id")
    }

    if (!supabase) {
      console.error("[/api/go] Missing Supabase envs (offer_id)")
      return res.status(500).send("Tracking unavailable")
    }

    const { data: offer, error: offerErr } = await supabase
      .from("store_offers")
      .select("id, product_id, platform, url")
      .eq("id", offer_id_num)
      .eq("is_active", true)
      .maybeSingle()

    if (offerErr) {
      console.error("[/api/go] Offer lookup error:", offerErr)
      return res.status(500).send("Offer lookup failed")
    }
    if (!offer) return res.status(404).send("Offer not found")

    const finalUrl = unwrapNestedGoUrl(offer.url) || offer.url
    if (!finalUrl || !isSafeHttpUrl(finalUrl)) {
      return res.status(400).send("Invalid offer url")
    }

    // best-effort price snapshot
    let price_at_click: number | null = null
    let currency_at_click: string | null = null
    let price_verified_date: string | null = null

    try {
      const { data: lp } = await supabase
        .from("offer_last_price")
        .select("price, currency, verified_date")
        .eq("offer_id", offer_id_num)
        .maybeSingle()

      if (lp) {
        price_at_click = lp.price ?? null
        currency_at_click = lp.currency ?? null
        price_verified_date = lp.verified_date ?? null
      }
    } catch {}

    let tracked = false
    try {
      const { error } = await supabase.from("product_outbounds").insert({
        product_id: offer.product_id,
        store: offer.platform,
        offer_id: offer_id_num,
        price_at_click,
        currency_at_click,
        price_verified_date,
        session_id,
        referer,
        user_agent: req.headers["user-agent"] ?? null,
        created_at: nowIso,
      })

      tracked = !error
      if (error) console.error("[/api/go] outbound insert error:", error)
    } catch (e) {
      console.error("[/api/go] outbound exception:", e)
    }

    return redirect(finalUrl, tracked ? "1" : "0")
  }

  // ===========================
  // MODE B: legacy
  // ===========================
  const store = normalizeStore(store_raw)
  const product_id = product_id_raw.trim()

  if (!rawUrl || !product_id || !store) {
    return res.status(400).send("Missing params")
  }
  if (!isUuidLike(product_id)) {
    return res.status(400).send("Invalid product_id")
  }

  const finalUrl = unwrapNestedGoUrl(rawUrl)
  if (!finalUrl || !isSafeHttpUrl(finalUrl)) {
    return res.status(400).send("Invalid url")
  }

  if (!supabase) {
    console.error("[/api/go] Missing Supabase envs (legacy)")
    return redirect(finalUrl, "0")
  }

  let tracked = false
  try {
    const { error } = await supabase.from("product_outbounds").insert({
      product_id,
      store,
      session_id,
      referer,
      user_agent: req.headers["user-agent"] ?? null,
      created_at: nowIso,
    })

    tracked = !error
    if (error) console.error("[/api/go] legacy outbound insert error:", error)
  } catch (e) {
    console.error("[/api/go] legacy outbound exception:", e)
  }

  return redirect(finalUrl, tracked ? "1" : "0")
}

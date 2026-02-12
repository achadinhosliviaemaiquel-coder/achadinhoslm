import type { VercelRequest, VercelResponse } from "@vercel/node"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

function getServerSupabase() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type Store = "shopee" | "mercadolivre" | "amazon"
type Traffic = "ads" | "organic"

function normalizeStore(input: string): Store | null {
  const s = (input || "").trim().toLowerCase()
  if (s === "ml" || s === "meli" || s === "mercado_livre" || s === "mercadolivre") return "mercadolivre"
  if (s === "amz" || s === "amazon") return "amazon"
  if (s === "shopee") return "shopee"
  return null
}

function normalizeTraffic(input: unknown): Traffic | null {
  const s = String(input ?? "").trim().toLowerCase()
  if (s === "ads") return "ads"
  if (s === "organic") return "organic"
  return null
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v !== "string") return null
  const raw = v.trim()
  if (!raw) return null
  const normalized = raw.replace(",", ".")
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

function toIntOrNull(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v)
  if (typeof v !== "string") return null
  const raw = v.trim()
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

function roundCents(price: number): number {
  return Math.round((price + Number.EPSILON) * 100)
}

function relativeError(a: number, b: number) {
  const denom = Math.max(Math.abs(b), 1e-9)
  return Math.abs(a - b) / denom
}

async function getExpectedPrice(supabase: SupabaseClient, productId: string, store: Store): Promise<number | null> {
  const { data, error } = await supabase
    .from("products")
    .select("shopee_price, mercadolivre_price, amazon_price")
    .eq("id", productId)
    .maybeSingle()

  if (error || !data) return null

  const v =
    store === "shopee"
      ? (data as any).shopee_price
      : store === "mercadolivre"
        ? (data as any).mercadolivre_price
        : (data as any).amazon_price

  const n =
    typeof v === "number" && Number.isFinite(v)
      ? v
      : typeof v === "string"
        ? Number(v)
        : null

  return n != null && Number.isFinite(n) ? n : null
}

function sanitizePriceByExpected(price: number, expected: number): number {
  if (relativeError(price, expected) <= 0.25) return price

  const candidates = [
    { v: price, label: "as-is" },
    { v: price / 10, label: "/10" },
    { v: price / 100, label: "/100" },
  ].filter((c) => c.v > 0)

  candidates.sort((a, b) => relativeError(a.v, expected) - relativeError(b.v, expected))

  const best = candidates[0]
  if (best && relativeError(best.v, expected) <= 0.25) return best.v

  return price
}

function parseBodyIfNeeded(req: VercelRequest): any | null {
  const b: any = (req as any).body
  if (!b) return null

  if (typeof b === "object" && !Buffer.isBuffer(b)) return b

  if (Buffer.isBuffer(b)) {
    try {
      const s = b.toString("utf8")
      return s ? JSON.parse(s) : null
    } catch {
      return null
    }
  }

  if (typeof b === "string") {
    try {
      const s = b.trim()
      return s ? JSON.parse(s) : null
    } catch {
      return null
    }
  }

  return null
}

/**
 * Classifica tráfego a partir do referer/referrer e user-agent:
 * - ads se tem utm_medium=paid, utm_source fb/ig, fbclid, ou user-agent de in-app FB/IG
 * - caso contrário organic
 */
function detectTraffic(req: VercelRequest): Traffic {
  const ua = String(req.headers["user-agent"] ?? "")
  const ref = String((req.headers["referer"] as string) ?? (req.headers["referrer"] as string) ?? "")

  let sp: URLSearchParams | null = null
  try {
    if (ref) {
      const u = new URL(ref, "https://dummy.local")
      sp = u.searchParams
    }
  } catch {
    sp = null
  }

  const utmMedium = (sp?.get("utm_medium") || "").toLowerCase()
  const utmSource = (sp?.get("utm_source") || "").toLowerCase()
  const fbclid = sp?.get("fbclid") || ""

  const looksLikePaid =
    utmMedium === "paid" ||
    utmMedium === "cpc" ||
    utmMedium === "ads" ||
    utmMedium === "paid_social" ||
    utmMedium === "social_paid"

  const looksLikeFbIg =
    utmSource === "fb" ||
    utmSource === "facebook" ||
    utmSource === "ig" ||
    utmSource === "instagram"

  const uaIsFbIgInApp =
    ua.includes("FBAV") || ua.includes("FB_IAB") || ua.toLowerCase().includes("instagram")

  const refIsFbIg =
    ref.includes("facebook.com") || ref.includes("l.facebook.com") || ref.includes("instagram.com")

  if (fbclid || looksLikePaid || looksLikeFbIg || uaIsFbIgInApp || refIsFbIg) return "ads"
  return "organic"
}

async function getExistingColumns(supabase: SupabaseClient, table: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("information_schema.columns")
    .select("column_name")
    .eq("table_schema", "public")
    .eq("table_name", table)

  if (error) throw error
  const set = new Set<string>()
  for (const r of data ?? []) set.add(String((r as any).column_name))
  return set
}

function pickString(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return s ? s : null
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store")

  if (req.method && !["GET", "POST"].includes(req.method)) {
    return res.status(405).send("Method Not Allowed")
  }

  const supabase = getServerSupabase()
  if (!supabase) return res.status(204).end()

  try {
    const bodyObj = req.method === "POST" ? parseBodyIfNeeded(req) : null
    const q: any = bodyObj && typeof bodyObj === "object" ? bodyObj : req.query

    const product_id = String(q.product_id || "").trim()
    const storeRaw = String(q.store || "").trim()
    const store = normalizeStore(storeRaw)

    if (!product_id || !store) return res.status(204).end()

    const product_slug = pickString(q.product_slug)
    const category = pickString(q.category)
    const outbound_url = pickString(q.outbound_url)

    // UTM/click ids (opcionais)
    const utm_source = pickString(q.utm_source)
    const utm_medium = pickString(q.utm_medium)
    const utm_campaign = pickString(q.utm_campaign)
    const utm_content = pickString(q.utm_content)
    const utm_term = pickString(q.utm_term)
    const fbclid = pickString(q.fbclid)
    const gclid = pickString(q.gclid)
    const ttclid = pickString(q.ttclid)

    const priceCentsFromClient = toIntOrNull(q.price_cents)
    let price: number | null = null
    let price_cents: number | null = null

    if (priceCentsFromClient != null && priceCentsFromClient > 0) {
      price_cents = priceCentsFromClient
      price = Number((price_cents / 100).toFixed(2))
    } else {
      price = toNumberOrNull(q.price)

      if (price != null) {
        const expected = await getExpectedPrice(supabase, product_id, store)
        if (expected != null && expected > 0) {
          const before = price
          price = sanitizePriceByExpected(price, expected)

          if (before !== price) {
            console.warn("[/api/intent] adjusted price", { product_id, store, before, after: price, expected })
          }
        }
      }

      price_cents = price != null ? roundCents(price) : null
    }

    // ✅ prioridade: payload traffic -> detectTraffic(req)
    const trafficFromClient = normalizeTraffic(q.traffic)
    const traffic: Traffic = trafficFromClient ?? detectTraffic(req)

    const payload: Record<string, any> = {
      kind: "intent",
      product_id,
      store,
      product_slug,
      category,
      traffic,

      // utm/click ids (só grava se existir colunas)
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      fbclid,
      gclid,
      ttclid,

      price: price != null && Number.isFinite(price) ? price : null,
      price_cents: price_cents != null && Number.isFinite(price_cents) ? price_cents : null,
      user_agent: req.headers["user-agent"] ?? null,
      referrer: (req.headers["referer"] as string) ?? null,
      referer: (req.headers["referer"] as string) ?? null,
      created_at: new Date().toISOString(),
    }

    if (outbound_url) payload.outbound_url = outbound_url

    // limpa undefined
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k]
    })

    // tentativa normal
    const first = await supabase.from("product_clicks").insert(payload)
    if (!first.error) return res.status(204).end()

    // Se o erro for "coluna não existe" (schema cache), tenta novamente removendo colunas inexistentes
    const code = (first.error as any)?.code
    if (code !== "PGRST204") {
      console.error("[/api/intent] insert error:", {
        message: first.error.message,
        code,
        details: (first.error as any).details,
        hint: (first.error as any).hint,
        payload,
      })
      return res.status(204).end()
    }

    // Retry: remove campos que não existem na tabela
    try {
      const cols = await getExistingColumns(supabase, "product_clicks")
      const sanitized: Record<string, any> = {}
      for (const [k, v] of Object.entries(payload)) {
        if (cols.has(k)) sanitized[k] = v
      }

      const second = await supabase.from("product_clicks").insert(sanitized)
      if (second.error) {
        console.error("[/api/intent] insert retry error:", {
          message: second.error.message,
          code: (second.error as any)?.code,
          details: (second.error as any).details,
          hint: (second.error as any).hint,
          sanitized,
        })
      }
    } catch (e) {
      console.error("[/api/intent] retry sanitize exception:", e)
    }
  } catch (e) {
    console.error("[/api/intent] Error:", e)
  }

  return res.status(204).end()
}

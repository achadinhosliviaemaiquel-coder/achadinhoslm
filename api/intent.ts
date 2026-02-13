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

async function getExpectedPrice(
  supabase: SupabaseClient,
  productId: string,
  store: Store
): Promise<number | null> {
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

type UTMFields = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  utm_term: string | null
  fbclid: string | null
  gclid: string | null
  ttclid: string | null
}

function pickString(v: unknown): string | null {
  const s = String(v ?? "").trim()
  return s ? s : null
}

function getHeaderReferer(req: VercelRequest): string {
  return String((req.headers["referer"] as string) ?? (req.headers["referrer"] as string) ?? "")
}

/**
 * UTMs do payload (query/body). Se vazio, tenta do referer.
 */
function resolveUtm(req: VercelRequest, q: any): UTMFields {
  const fromPayload: UTMFields = {
    utm_source: pickString(q.utm_source),
    utm_medium: pickString(q.utm_medium),
    utm_campaign: pickString(q.utm_campaign),
    utm_content: pickString(q.utm_content),
    utm_term: pickString(q.utm_term),
    fbclid: pickString(q.fbclid),
    gclid: pickString(q.gclid),
    ttclid: pickString(q.ttclid),
  }

  const hasAny =
    !!fromPayload.utm_source ||
    !!fromPayload.utm_medium ||
    !!fromPayload.utm_campaign ||
    !!fromPayload.utm_content ||
    !!fromPayload.utm_term ||
    !!fromPayload.fbclid ||
    !!fromPayload.gclid ||
    !!fromPayload.ttclid

  if (hasAny) return fromPayload

  const ref = getHeaderReferer(req)
  if (!ref) {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      fbclid: null,
      gclid: null,
      ttclid: null,
    }
  }

  try {
    const u = new URL(ref, "https://dummy.local")
    const sp = u.searchParams
    return {
      utm_source: sp.get("utm_source"),
      utm_medium: sp.get("utm_medium"),
      utm_campaign: sp.get("utm_campaign"),
      utm_content: sp.get("utm_content"),
      utm_term: sp.get("utm_term"),
      fbclid: sp.get("fbclid"),
      gclid: sp.get("gclid"),
      ttclid: sp.get("ttclid"),
    }
  } catch {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      fbclid: null,
      gclid: null,
      ttclid: null,
    }
  }
}

function detectTraffic(req: VercelRequest, utm: UTMFields): Traffic {
  const ua = String(req.headers["user-agent"] ?? "")
  const ref = getHeaderReferer(req)

  const utmMedium = (utm.utm_medium || "").toLowerCase()
  const utmSource = (utm.utm_source || "").toLowerCase()

  const looksLikePaid =
    utmMedium === "paid" ||
    utmMedium === "cpc" ||
    utmMedium === "ads" ||
    utmMedium === "paid_social" ||
    utmMedium === "social_paid"

  const looksLikeSocialSource =
    utmSource === "fb" ||
    utmSource === "facebook" ||
    utmSource === "ig" ||
    utmSource === "instagram" ||
    utmSource === "tt" ||
    utmSource === "tiktok"

  const hasClid = Boolean(utm.fbclid || utm.gclid || utm.ttclid)

  const uaIsInApp =
    ua.includes("FBAV") ||
    ua.includes("FB_IAB") ||
    /Instagram/i.test(ua) ||
    /TikTok|TTWebView|BytedanceWebview|ByteDanceWebview|Bytedance|musical_ly|musically/i.test(ua)

  const refIsSocial =
    /facebook\.com|l\.facebook\.com|instagram\.com|l\.instagram\.com|tiktok\.com|vm\.tiktok\.com|m\.tiktok\.com|ads\.tiktok\.com/i.test(ref)

  if (hasClid) return "ads"
  if (looksLikePaid) return "ads"
  if (uaIsInApp || refIsSocial) return "ads"
  if (looksLikeSocialSource && (looksLikePaid || hasClid)) return "ads"

  return "organic"
}

function extractMissingColumnFromPgrst204(message?: string): string | null {
  if (!message) return null
  const m = message.match(/Could not find the '([^']+)' column/)
  return m?.[1] ?? null
}

async function safeInsertNoIntrospection(
  supabase: SupabaseClient,
  table: string,
  payload: Record<string, any>,
  logPrefix: string,
  maxRetries = 6
) {
  const clean: Record<string, any> = { ...payload }
  Object.keys(clean).forEach((k) => {
    if (clean[k] === undefined) delete clean[k]
  })

  let current = clean

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const r = await supabase.from(table).insert(current)
    if (!r.error) return

    const code = (r.error as any)?.code
    if (code !== "PGRST204") {
      console.error(`${logPrefix} insert error:`, {
        message: r.error.message,
        code,
        details: (r.error as any).details,
        hint: (r.error as any).hint,
      })
      return
    }

    const missing = extractMissingColumnFromPgrst204(r.error.message)
    if (!missing || !(missing in current)) {
      console.error(`${logPrefix} insert PGRST204 but could not sanitize:`, {
        message: r.error.message,
        code,
      })
      return
    }

    const next = { ...current }
    delete next[missing]
    current = next

    if (attempt === maxRetries) {
      console.error(`${logPrefix} insert failed after retries (missing columns). Last missing: ${missing}`)
      return
    }
  }
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
    const store = normalizeStore(String(q.store || "").trim())
    if (!product_id || !store) return res.status(204).end()

    const product_slug = pickString(q.product_slug)
    const category = pickString(q.category)
    const outbound_url = pickString(q.outbound_url)

    const utm = resolveUtm(req, q)

    // preço
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

    // traffic: payload > detect
    const trafficFromClient = normalizeTraffic(q.traffic)
    const traffic: Traffic = trafficFromClient ?? detectTraffic(req, utm)

    const payload: Record<string, any> = {
      kind: "intent",
      product_id,
      store,
      product_slug,
      category,
      traffic,

      utm_source: utm.utm_source,
      utm_medium: utm.utm_medium,
      utm_campaign: utm.utm_campaign,
      utm_content: utm.utm_content,
      utm_term: utm.utm_term,
      fbclid: utm.fbclid,
      gclid: utm.gclid,
      ttclid: utm.ttclid,

      price: price != null && Number.isFinite(price) ? price : null,
      price_cents: price_cents != null && Number.isFinite(price_cents) ? price_cents : null,

      user_agent: req.headers["user-agent"] ?? null,
      referer: getHeaderReferer(req) || null,
      referrer: getHeaderReferer(req) || null,
      created_at: new Date().toISOString(),
    }

    if (outbound_url) payload.outbound_url = outbound_url

    await safeInsertNoIntrospection(
      supabase as SupabaseClient,
      "product_clicks",
      payload,
      "[/api/intent] product_clicks",
      6
    )
  } catch (e) {
    console.error("[/api/intent] Error:", e)
  }

  return res.status(204).end()
}

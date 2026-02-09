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

type Store = "shopee" | "mercadolivre" | "amazon"

function normalizeStore(input: string): Store | null {
  const s = (input || "").trim().toLowerCase()
  if (s === "ml" || s === "meli" || s === "mercado_livre" || s === "mercadolivre") return "mercadolivre"
  if (s === "amz" || s === "amazon") return "amazon"
  if (s === "shopee") return "shopee"
  return null
}

function toNumberOrNull(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (typeof v !== "string") return null
  const raw = v.trim()
  if (!raw) return null

  // aceita "49.90" e "49,90"
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
  // evita flutuação (ex.: 34.49 * 100 = 3448.999999)
  return Math.round((price + Number.EPSILON) * 100)
}

function relativeError(a: number, b: number) {
  const denom = Math.max(Math.abs(b), 1e-9)
  return Math.abs(a - b) / denom
}

async function getExpectedPrice(supabase: ReturnType<typeof createClient>, productId: string, store: Store): Promise<number | null> {
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

  const n = typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" ? Number(v) : null
  return n != null && Number.isFinite(n) ? n : null
}

function sanitizePriceByExpected(price: number, expected: number): number {
  // Se o preço já está perto do esperado, mantém.
  if (relativeError(price, expected) <= 0.25) return price

  // Testa divisões comuns (10x/100x) e pega a melhor.
  const candidates = [
    { v: price, label: "as-is" },
    { v: price / 10, label: "/10" },
    { v: price / 100, label: "/100" },
  ].filter((c) => c.v > 0)

  candidates.sort((a, b) => relativeError(a.v, expected) - relativeError(b.v, expected))

  const best = candidates[0]
  // Só aplica se realmente melhorar bastante e ficar “perto o suficiente”
  if (best && relativeError(best.v, expected) <= 0.25) return best.v

  return price
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store")

  if (req.method && !["GET", "POST"].includes(req.method)) {
    return res.status(405).send("Method Not Allowed")
  }

  const supabase = getServerSupabase()
  if (!supabase) return res.status(204).end()

  try {
    // aceita tanto query quanto body
    const q: any = req.method === "POST" && req.body && typeof req.body === "object" ? req.body : req.query

    const product_id = String(q.product_id || "").trim()
    const storeRaw = String(q.store || "").trim()
    const store = normalizeStore(storeRaw)

    if (!product_id || !store) return res.status(204).end()

    const product_slug = String(q.product_slug || "").trim() || null
    const category = String(q.category || "").trim() || null

    /**
     * ✅ NOVO: prioriza price_cents (inteiro) vindo do front.
     * Se vier, ele manda:
     *  - price_cents=4999
     *  - price=49.99
     *
     * Se price_cents vier, a gente confia nele.
     * Se não vier, cai pro price e faz saneamento.
     */
    const priceCentsFromClient = toIntOrNull(q.price_cents)
    let price: number | null = null
    let price_cents: number | null = null

    if (priceCentsFromClient != null && priceCentsFromClient > 0) {
      price_cents = priceCentsFromClient
      price = Number((price_cents / 100).toFixed(2))
    } else {
      // preço vindo do front (pode vir bugado)
      price = toNumberOrNull(q.price)

      // ✅ saneamento com base no preço esperado no banco (se existir)
      if (price != null) {
        const expected = await getExpectedPrice(supabase, product_id, store)
        if (expected != null && expected > 0) {
          const before = price
          price = sanitizePriceByExpected(price, expected)

          if (before !== price) {
            console.warn("[/api/intent] adjusted price", {
              product_id,
              store,
              before,
              after: price,
              expected,
            })
          }
        }
      }

      price_cents = price != null ? roundCents(price) : null
    }

    // ✅ tabela exige kind NOT NULL (e tem CHECK)
    const payload: Record<string, any> = {
      kind: "intent",
      product_id,
      store,
      product_slug,
      category,

      // grava ambos
      price: price != null && Number.isFinite(price) ? price : null,
      price_cents: price_cents != null && Number.isFinite(price_cents) ? price_cents : null,

      user_agent: req.headers["user-agent"] ?? null,

      // sua tabela tem "referrer" e também "referer" (duplicado) — vamos popular os dois
      referrer: (req.headers["referer"] as string) ?? null,
      referer: (req.headers["referer"] as string) ?? null,

      created_at: new Date().toISOString(),
    }

    // remove undefined (mantém null)
    Object.keys(payload).forEach((k) => {
      if (payload[k] === undefined) delete payload[k]
    })

    const { error } = await supabase.from("product_clicks").insert(payload)

    if (error) {
      console.error("[/api/intent] insert error:", {
        message: error.message,
        code: (error as any).code,
        details: (error as any).details,
        hint: (error as any).hint,
        payload,
      })
    }
  } catch (e) {
    console.error("[/api/intent] Error:", e)
  }

  return res.status(204).end()
}

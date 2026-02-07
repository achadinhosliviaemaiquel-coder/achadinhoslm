import { createClient } from "@supabase/supabase-js"

// ---------- CONFIG ----------
const MAX_REDIRECTS = 8
const TIMEOUT_MS = 15000

// ---------- ENV ----------
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL) {
  console.error("❌ Missing env: SUPABASE_URL")
  process.exit(1)
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error("❌ Missing env: SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

// ---------- SUPABASE ----------
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// ---------- HELPERS ----------
function extractMlb(url) {
  const match = String(url || "").match(/(MLB\d+)/i)
  return match ? match[1].toUpperCase() : null
}

async function fetchManual(url, method) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    return await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      headers: {
        // ajuda a evitar alguns bloqueios
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function followRedirects(startUrl) {
  let current = startUrl

  for (let i = 0; i < MAX_REDIRECTS; i++) {
    // 1) tenta HEAD (mais leve)
    let res = await fetchManual(current, "HEAD")

    // 2) se HEAD falhar/bloquear, tenta GET
    if (!res || (res.status >= 400 && res.status !== 301 && res.status !== 302 && res.status !== 303 && res.status !== 307 && res.status !== 308)) {
      res = await fetchManual(current, "GET")
    }

    const location = res.headers.get("location")
    if (!location) return current

    current = new URL(location, current).toString()
  }

  return current
}

// ---------- MAIN ----------
async function run() {
  console.log("🔎 Buscando ofertas Mercado Livre sem MLB...")

  const { data: offers, error } = await supabase
    .from("store_offers")
    .select("id, product_id, url")
    .eq("platform", "mercadolivre")
    .is("external_id", null)

  if (error) {
    console.error("❌ Erro ao buscar ofertas:", error)
    process.exit(1)
  }

  if (!offers || offers.length === 0) {
    console.log("✅ Nenhuma oferta pendente.")
    return
  }

  console.log(`📦 ${offers.length} ofertas encontradas\n`)

  const failures = []
  let success = 0

  for (const offer of offers) {
    const secUrl = String(offer.url || "")
    console.log(`➡️ Offer ${offer.id} | ${secUrl}`)

    try {
      const finalUrl = await followRedirects(secUrl)
      const mlb = extractMlb(finalUrl)

      if (!mlb) {
        console.warn(`⚠️ MLB não encontrado: ${finalUrl}\n`)
        failures.push({ offer_id: offer.id, secUrl, finalUrl, reason: "MLB_NOT_FOUND" })
        continue
      }

      const { error: updErr } = await supabase
        .from("store_offers")
        .update({
          external_id: mlb,
          url: finalUrl, // normaliza pra URL final (melhor pra /api/go e pra API)
          updated_at: new Date().toISOString(),
        })
        .eq("id", offer.id)

      if (updErr) {
        console.error(`❌ Erro ao atualizar offer ${offer.id}`, updErr)
        failures.push({ offer_id: offer.id, secUrl, finalUrl, reason: "UPDATE_FAILED", detail: updErr })
        continue
      }

      console.log(`✅ OK → ${mlb}\n`)
      success++
    } catch (e) {
      console.error(`❌ Exception offer ${offer.id}:`, e)
      failures.push({ offer_id: offer.id, secUrl, reason: "EXCEPTION", detail: String(e?.message || e) })
    }
  }

  console.log("——— RESULTADO FINAL ———")
  console.log(`✅ Sucesso: ${success}`)
  console.log(`❌ Falhas: ${failures.length}`)
  if (failures.length) {
    console.log("\nFalhas (para resolver manualmente se necessário):")
    for (const f of failures) console.log(f)
  }
  console.log("———————————————")
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Fatal:", e)
    process.exit(1)
  })

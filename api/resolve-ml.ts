import type { VercelRequest, VercelResponse } from "@vercel/node"

const CRON_SECRET = process.env.CRON_SECRET ?? ""

// Domínios permitidos para seguir redirects (previne SSRF)
const ALLOWED_DOMAINS = [
  "mercadolivre.com.br",
  "mercadolibre.com",
  "mercado.livre.com.br",
  "shopee.com.br",
  "amazon.com.br",
  "amzn.to",
  "shope.ee",
  "click.mlcdn.com.br",
  "mercadolivre.com",
]

function isAllowedDomain(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return ALLOWED_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith("." + d)
    )
  } catch {
    return false
  }
}

function isPrivateIp(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
      hostname.endsWith(".internal") ||
      hostname === "169.254.169.254" // AWS metadata
    )
  } catch {
    return false
  }
}

function extractMlb(url: string): string | null {
  const m = url.match(/(MLB\d+)/i)
  return m ? m[1].toUpperCase() : null
}

async function headFollow(url: string, maxHops = 6): Promise<string> {
  let current = url

  for (let i = 0; i < maxHops; i++) {
    if (!isAllowedDomain(current) || isPrivateIp(current)) {
      throw new Error("Redirect to disallowed domain blocked")
    }

    const res = await fetch(current, {
      method: "HEAD",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    })
    const loc = res.headers.get("location")

    // 2xx (no redirect)
    if (!loc) return current

    // resolve relative
    current = new URL(loc, current).toString()
  }

  return current
}

function readCronSecret(req: VercelRequest): string {
  const h = (req.headers["x-cron-secret"] as string) || ""
  if (h) return h
  const auth = (req.headers["authorization"] as string) || ""
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim()
  try {
    const url = new URL(req.url ?? "", "https://dummy.local")
    return url.searchParams.get("cron_secret") || ""
  } catch {
    return ""
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Requer autenticação — endpoint interno
  const secret = readCronSecret(req)
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(401).json({ ok: false, error: "Unauthorized" })
  }

  try {
    if (req.method !== "POST") return res.status(405).send("Method not allowed")

    const { url } = (req.body || {}) as { url?: string }
    const raw = String(url || "").trim()
    if (!raw) return res.status(400).json({ ok: false, error: "Missing url" })

    if (!isAllowedDomain(raw) || isPrivateIp(raw)) {
      return res.status(400).json({ ok: false, error: "Domain not allowed" })
    }

    // segue redirects
    const finalUrl = await headFollow(raw)

    const mlb = extractMlb(finalUrl)
    if (!mlb) {
      return res.status(422).json({
        ok: false,
        error: "MLB not found in final URL",
        finalUrl,
      })
    }

    return res.status(200).json({ ok: true, finalUrl, mlb })
  } catch (e: any) {
    console.error("[resolve-ml] error:", e)
    return res.status(500).json({ ok: false, error: "Internal error" })
  }
}

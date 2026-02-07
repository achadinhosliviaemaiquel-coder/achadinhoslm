import type { VercelRequest, VercelResponse } from "@vercel/node"

function extractMlb(url: string): string | null {
  const m = url.match(/(MLB\d+)/i)
  return m ? m[1].toUpperCase() : null
}

async function headFollow(url: string, maxHops = 6): Promise<string> {
  let current = url

  for (let i = 0; i < maxHops; i++) {
    const res = await fetch(current, { method: "HEAD", redirect: "manual" })
    const loc = res.headers.get("location")

    // 2xx (no redirect)
    if (!loc) return current

    // resolve relative
    current = new URL(loc, current).toString()
  }

  return current
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") return res.status(405).send("Method not allowed")

    const { url } = (req.body || {}) as { url?: string }
    const raw = String(url || "").trim()
    if (!raw) return res.status(400).json({ ok: false, error: "Missing url" })

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
    return res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
}

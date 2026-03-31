// api/ml/oauth/start.ts

function readSecret(req: any): string {
  const h = (req.headers?.["x-cron-secret"] as string) || ""
  if (h) return h
  const auth = (req.headers?.["authorization"] as string) || ""
  if (auth.startsWith("Bearer ")) return auth.slice(7).trim()
  try {
    const url = new URL(req.url ?? "", "https://dummy.local")
    return url.searchParams.get("cron_secret") || ""
  } catch {
    return ""
  }
}

export default function handler(_req: any, res: any) {
  try {
    const cronSecret = process.env.CRON_SECRET || ""
    const provided = readSecret(_req)

    if (!cronSecret || provided !== cronSecret) {
      res.statusCode = 401
      res.setHeader("content-type", "application/json; charset=utf-8")
      return res.end(JSON.stringify({ ok: false, error: "Unauthorized" }))
    }

    const clientId = process.env.ML_CLIENT_ID || ""
    const redirectUri = process.env.ML_REDIRECT_URI || ""

    res.setHeader("content-type", "application/json; charset=utf-8")

    if (!clientId || !redirectUri) {
      res.statusCode = 500
      return res.end(
        JSON.stringify({ ok: false, error: "Missing env vars" })
      )
    }

    const url =
      "https://auth.mercadolivre.com.br/authorization" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`

    res.statusCode = 200
    return res.end(JSON.stringify({ ok: true, url }))
  } catch (e: any) {
    res.statusCode = 500
    return res.end(JSON.stringify({ ok: false, error: "Internal error" }))
  }
}

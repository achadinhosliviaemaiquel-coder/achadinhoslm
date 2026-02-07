// api/ml/oauth/start.ts

export default function handler(_req: any, res: any) {
  try {
    const clientId = process.env.ML_CLIENT_ID || "";
    const redirectUri = process.env.ML_REDIRECT_URI || "";

    res.setHeader("content-type", "application/json; charset=utf-8");

    if (!clientId || !redirectUri) {
      res.statusCode = 500;
      return res.end(
        JSON.stringify({
          ok: false,
          error: "Missing env vars",
          missing: {
            ML_CLIENT_ID: !clientId,
            ML_REDIRECT_URI: !redirectUri,
          },
        })
      );
    }

    const url =
      "https://auth.mercadolivre.com.br/authorization" +
      `?response_type=code` +
      `&client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}`;

    res.statusCode = 200;
    return res.end(JSON.stringify({ ok: true, url }));
  } catch (e: any) {
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
  }
}

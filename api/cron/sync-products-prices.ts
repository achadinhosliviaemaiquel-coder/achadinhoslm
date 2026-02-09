import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const CRON_SECRET = process.env.CRON_SECRET!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const got = (req.headers["x-cron-secret"] as string | undefined) || "";
  if (got !== CRON_SECRET) return res.status(401).json({ ok: false, error: "Unauthorized" });

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error } = await supabase.rpc("sync_products_ml_price");
  if (error) return res.status(500).json({ ok: false, error: error.message });

  return res.status(200).json({ ok: true });
}

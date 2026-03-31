import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Só aceita POST
  if (req.method !== "POST") return res.status(405).end();

  const path = (req.body?.path as string | undefined)?.trim() || "/";

  // Não rastreia rotas do admin
  if (path.startsWith("/admin")) return res.status(204).end();

  await supabase.from("page_views").insert({ path });

  return res.status(204).end();
}

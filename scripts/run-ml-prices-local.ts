import dotenv from "dotenv";

console.log(">>> RUNNER STARTED");

// garante carregar o .env.local
dotenv.config({ path: ".env.local" });

console.log(">>> ENV LOADED", {
  hasCronSecret: Boolean(process.env.CRON_SECRET),
  hasSupabaseUrl: Boolean(process.env.SUPABASE_URL),
  hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
});

import handler from "../api/cron/ml-prices";

function makeRes() {
  const res: any = {};
  res.statusCode = 200;

  res.status = (code: number) => {
    res.statusCode = code;
    return res;
  };

  res.json = (data: any) => {
    console.log(">>> RESPONSE JSON (HTTP", res.statusCode + ")");
    console.log(JSON.stringify(data, null, 2));
    return res;
  };

  res.send = (data: any) => {
    console.log(">>> RESPONSE SEND (HTTP", res.statusCode + ")");
    console.log(data);
    return res;
  };

  return res;
}

async function main() {
  console.log(">>> MAIN ENTER");

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error("CRON_SECRET não está definido no .env.local");
  }

  const req: any = {
    method: "GET",
    headers: { "x-cron-secret": secret },
    query: {},
  };

  const res = makeRes();

  console.log(">>> CALLING HANDLER");
  await handler(req, res);
  console.log(">>> HANDLER FINISHED");
}

main().catch((e) => {
  console.error(">>> RUNNER ERROR:", e?.message || e);
  process.exit(1);
});

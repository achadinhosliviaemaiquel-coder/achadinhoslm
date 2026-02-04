import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const supabase = createClient<Database>(
  `https://${projectId}.supabase.co`,
  publishableKey,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true, // 🔥 ESSENCIAL
    },
  }
);

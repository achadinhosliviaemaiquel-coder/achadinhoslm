import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let supabaseInstance: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("❌ SUPABASE ENV NÃO CARREGOU", {
      url: supabaseUrl,
      key: supabaseAnonKey,
    });
    throw new Error("Supabase env missing");
  }

  supabaseInstance = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseInstance;
}

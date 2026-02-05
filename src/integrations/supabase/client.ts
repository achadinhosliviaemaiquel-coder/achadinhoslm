import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

let supabase: SupabaseClient<Database> | null = null;

export function getSupabase() {
  if (supabase) return supabase;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl) throw new Error("VITE_SUPABASE_URL is missing");
  if (!supabaseAnonKey) throw new Error("VITE_SUPABASE_ANON_KEY is missing");

  supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      storage: typeof window !== "undefined" ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabase;
}

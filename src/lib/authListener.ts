import { getSupabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

type Callback = (session: Session | null) => void;

let callback: Callback | null = null;
let initialized = false;

export function initAuthListener(cb: Callback) {
  callback = cb;

  if (initialized) return;
  initialized = true;

  const supabase = getSupabase();

  supabase.auth.onAuthStateChange((_event, session) => {
    callback?.(session);
  });
}

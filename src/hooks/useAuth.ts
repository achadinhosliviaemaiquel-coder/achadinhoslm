import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { initAuthListener } from "@/lib/authListener";
import type { User, Session } from "@supabase/supabase-js";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const listenerInitialized = useRef(false);

  const checkAdminRole = async (userId: string) => {
    try {
      console.log("RPC CALL START");

      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "admin",
      });

      console.log("RPC RESULT:", data, error);

      if (error) {
        setIsAdmin(false);
      } else {
        setIsAdmin((prev) => (prev === !!data ? prev : !!data));
      }
    } catch {
      setIsAdmin(false);
    }
  };

  useEffect(() => {
    if (listenerInitialized.current) return;
    listenerInitialized.current = true;

    console.log("AUTH INIT");

    const init = async () => {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;

      setSession(currentSession);
      setUser(currentSession?.user ?? null);

      // 🔥 verifica role ANTES de liberar loading
      if (currentSession?.user) {
        await checkAdminRole(currentSession.user.id);
      }

      setLoading(false);
    };

    init();

    initAuthListener(async (newSession) => {
      console.log("AUTH STATE CHANGED");

      setSession((prev) =>
        prev?.access_token === newSession?.access_token ? prev : newSession
      );

      setUser((prev) =>
        prev?.id === newSession?.user?.id ? prev : newSession?.user ?? null
      );

      if (newSession?.user) {
        await checkAdminRole(newSession.user.id);
      } else {
        setIsAdmin(false);
      }
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return { user, session, loading, isAdmin, signIn, signUp, signOut };
}

import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

function getSessionId(): string {
  let sid = sessionStorage.getItem("_asid");
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("_asid", sid);
  }
  return sid;
}

/**
 * Q35: Registra uma view de produto com deduplicação por sessão.
 * Evita contar múltiplas views do mesmo produto na mesma sessão.
 */
export function useProductView(productId: string | undefined) {
  const recorded = useRef(false);

  useEffect(() => {
    if (!productId || recorded.current) return;

    const sessionId = getSessionId();
    const viewKey = `view_${productId}`;

    // Deduplicação local: não registra se já viu nesta sessão
    if (sessionStorage.getItem(viewKey)) return;

    recorded.current = true;
    sessionStorage.setItem(viewKey, "1");

    supabase
      .from("product_views")
      .insert({
        product_id: productId,
        session_id: sessionId,
        referer: document.referrer || null,
        user_agent: navigator.userAgent,
        traffic: document.referrer ? "organic" : "direct",
        origin: window.location.origin,
      })
      .then(({ error }) => {
        if (error) {
          console.warn("Failed to record product view:", error.message);
        }
      });
  }, [productId]);
}
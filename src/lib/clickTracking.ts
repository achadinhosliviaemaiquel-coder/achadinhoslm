import { getSupabase } from "@/integrations/supabase/client";

type Store = "shopee" | "mercadolivre" | "amazon";

type TrackBuyClickParams = {
  productId: string;
  productSlug: string;
  category: string;
  store: Store;
  price: number;
  outboundUrl: string;
  redirectMode?: "new_tab" | "server_go";
};

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

function buildGoUrl(p: TrackBuyClickParams) {
  const qs = new URLSearchParams({
    product_id: p.productId,
    store: p.store,
    url: p.outboundUrl,
    product_slug: p.productSlug,
    category: p.category,
    price: String(p.price ?? ""),
  });

  return `${window.location.origin}/api/go?${qs.toString()}`;
}

function buildIntentUrl(p: TrackBuyClickParams) {
  const qs = new URLSearchParams({
    product_id: p.productId,
    store: p.store,
    product_slug: p.productSlug,
    category: p.category,
    price: String(p.price ?? ""),
  });

  return `${window.location.origin}/api/intent?${qs.toString()}`;
}

export function trackBuyClick(p: TrackBuyClickParams) {
  const redirectMode = p.redirectMode ?? "server_go";
  const isDev = import.meta.env.DEV;

  // 1) GA4 (intenção)
  try {
    window.gtag?.("event", "affiliate_click", {
      product_id: p.productId,
      product_slug: p.productSlug,
      category: p.category,
      store: p.store,
      value: p.price ?? undefined,
    });
  } catch {
    // no-op
  }

  // ✅ DEV (localhost): registra no Supabase direto e abre em nova aba
  if (isDev) {
    const supabase = getSupabase();

    supabase
      .from("product_clicks")
      .insert({
        product_id: p.productId,
        store: p.store,
      } as any)
      .then(({ error }) => {
        if (error) {
          console.error("❌ DEV: erro ao registrar clique:", error);
        } else {
          console.debug("✅ DEV: clique registrado:", {
            productId: p.productId,
            store: p.store,
          });
        }
      });

    window.open(p.outboundUrl, "_blank", "noopener,noreferrer");
    return;
  }

  // 2) PROD: Envia intenção via beacon
  try {
    const intentUrl = buildIntentUrl(p);
    if (navigator.sendBeacon) {
      navigator.sendBeacon(intentUrl);
    } else {
      fetch(intentUrl, { method: "GET", keepalive: true }).catch(() => {});
    }
  } catch {
    // no-op
  }

  // 3) PROD: Redirect para /api/go
  const goUrl = buildGoUrl(p);

  if (redirectMode === "new_tab") {
    window.open(goUrl, "_blank", "noopener,noreferrer");
    return;
  }

  window.location.href = goUrl;
}

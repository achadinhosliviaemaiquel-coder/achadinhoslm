// GA4 Analytics abstraction layer
// Measurement ID via env (recomendado no Vite/Vercel): VITE_GA_ID=G-L8J2YZRFFP

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

// opcional: manter constante para fallback
export const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_ID || "G-L8J2YZRFFP";

/**
 * ✅ Recomendado: GA é carregado pelo index.html.
 * Essa função fica segura caso algum lugar do app chame initGA4().
 * Ela NÃO injeta script (evita duplicação).
 */
export function initGA4() {
  // No-op de propósito para evitar duplicar GA
  return;
}

// Track custom events
export function trackEvent(
  eventName: string,
  parameters?: Record<string, string | number | boolean | undefined | null>,
) {
  if (typeof window === "undefined" || typeof window.gtag !== "function")
    return;

  // remove undefined/null pra não poluir
  const cleaned: Record<string, any> = {};
  if (parameters) {
    for (const [k, v] of Object.entries(parameters)) {
      if (v !== undefined && v !== null) cleaned[k] = v;
    }
  }

  window.gtag("event", eventName, cleaned);
}

// Specific event trackers
export function trackProductView(productSlug: string, category: string) {
  trackEvent("product_view", {
    product_slug: productSlug,
    category,
  });
}

export function trackCategoryView(category: string, subcategory?: string) {
  trackEvent("category_view", {
    category,
    subcategory: subcategory || "",
  });
}

export function trackBridgeLoaded(store: string, productSlug: string) {
  trackEvent("bridge_loaded", {
    store_name: store,
    product_slug: productSlug,
  });
}

export function trackOutboundClick(
  store: string,
  productSlug: string,
  clickId: string,
) {
  trackEvent("outbound_click", {
    store_name: store,
    product_slug: productSlug,
    click_id: clickId,
  });
}

/**
 * ✅ Novo evento padrão para compra (GA4)
 * Usaremos isso no botão principal + alternativas.
 */
export function trackBuyClickGA(args: {
  product_id: string;
  product_slug: string;
  category: string;
  store: "shopee" | "amazon" | "mercadolivre";
  price: number;
  commission_rate?: number;
  estimated_commission?: number;
}) {
  trackEvent("affiliate_click", {
    store: args.store,
    store_name: args.store, // opcional (se você já usa store_name em relatórios)
    product_id: args.product_id,
    product_slug: args.product_slug,
    category: args.category,
    price: args.price,
    commission_rate: args.commission_rate,
    estimated_commission: args.estimated_commission,
    page_path: window.location?.pathname,
  });
}

type Store = "shopee" | "mercadolivre" | "amazon";

type TrackBuyClickParams = {
  productId: string;
  productSlug: string;
  category: string;
  store: Store;
  price: number;
  outboundUrl: string;
};

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
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

/**
 * ✅ TRACK ONLY:
 * - GA4 + /api/intent
 * - NÃO abre aba
 * - NÃO redireciona
 *
 * A navegação deve acontecer 1x no StoreButton (via href /api/go)
 */
export function trackBuyClick(p: TrackBuyClickParams) {
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

  // 2) Intent via beacon/keepalive (dev + prod)
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
}

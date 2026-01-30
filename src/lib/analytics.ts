// GA4 Analytics abstraction layer
// Measurement ID: G-L8J2YZRFFP

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

export const GA_MEASUREMENT_ID = 'G-L8J2YZRFFP';

// Initialize GA4
export function initGA4() {
  if (typeof window === 'undefined') return;
  
  // Create script element
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
  document.head.appendChild(script);

  // Initialize dataLayer
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(...args: unknown[]) {
    window.dataLayer.push(args);
  };
  
  window.gtag('js', new Date());
  window.gtag('config', GA_MEASUREMENT_ID, {
    send_page_view: true,
  });
}

// Track custom events
export function trackEvent(
  eventName: string, 
  parameters?: Record<string, string | number | boolean>
) {
  if (typeof window === 'undefined' || !window.gtag) return;
  
  window.gtag('event', eventName, parameters);
}

// Specific event trackers
export function trackProductView(productSlug: string, category: string) {
  trackEvent('product_view', {
    product_slug: productSlug,
    category: category,
  });
}

export function trackCategoryView(category: string, subcategory?: string) {
  trackEvent('category_view', {
    category: category,
    subcategory: subcategory || '',
  });
}

export function trackBridgeLoaded(store: string, productSlug: string) {
  trackEvent('bridge_loaded', {
    store_name: store,
    product_slug: productSlug,
  });
}

export function trackOutboundClick(store: string, productSlug: string, clickId: string) {
  trackEvent('outbound_click', {
    store_name: store,
    product_slug: productSlug,
    click_id: clickId,
  });
}

// In-app browser detection utilities

export interface BrowserInfo {
  isInAppBrowser: boolean;
  browserName: string;
  isInstagram: boolean;
  isFacebook: boolean;
  isTikTok: boolean;
}

export function detectBrowser(): BrowserInfo {
  if (typeof window === 'undefined' || !navigator) {
    return {
      isInAppBrowser: false,
      browserName: 'unknown',
      isInstagram: false,
      isFacebook: false,
      isTikTok: false,
    };
  }

  const ua = navigator.userAgent || navigator.vendor || '';
  
  const isInstagram = /Instagram/i.test(ua);
  const isFacebook = /FBAN|FBAV|FB_IAB/i.test(ua);
  const isTikTok = /TikTok|BytedanceWebview/i.test(ua);
  
  const isInAppBrowser = isInstagram || isFacebook || isTikTok;
  
  let browserName = 'browser';
  if (isInstagram) browserName = 'instagram';
  else if (isFacebook) browserName = 'facebook';
  else if (isTikTok) browserName = 'tiktok';

  return {
    isInAppBrowser,
    browserName,
    isInstagram,
    isFacebook,
    isTikTok,
  };
}

// Generate unique click ID
export function generateClickId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

// Store click ID in both cookie and localStorage
export function storeClickId(clickId: string, productSlug: string, store: string) {
  const data = {
    clickId,
    productSlug,
    store,
    timestamp: Date.now(),
  };
  
  // localStorage
  try {
    localStorage.setItem('affiliate_click', JSON.stringify(data));
  } catch {
    // localStorage not available
  }
  
  // First-party cookie (7 days expiry)
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `affiliate_click=${encodeURIComponent(JSON.stringify(data))}; expires=${expires}; path=/; SameSite=Lax`;
}

// Retrieve stored click ID
export function getStoredClickId(): string | null {
  try {
    const stored = localStorage.getItem('affiliate_click');
    if (stored) {
      const data = JSON.parse(stored);
      return data.clickId;
    }
  } catch {
    // Try cookie fallback
    const match = document.cookie.match(/affiliate_click=([^;]+)/);
    if (match) {
      try {
        const data = JSON.parse(decodeURIComponent(match[1]));
        return data.clickId;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Append click_id to affiliate URL
export function appendClickId(url: string, clickId: string): string {
  try {
    const urlObj = new URL(url);
    urlObj.searchParams.set('click_id', clickId);
    return urlObj.toString();
  } catch {
    // If URL parsing fails, append manually
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}click_id=${encodeURIComponent(clickId)}`;
  }
}

// Preserve UTM parameters from current URL
export function preserveUtmParams(targetUrl: string): string {
  if (typeof window === 'undefined') return targetUrl;
  
  const currentParams = new URLSearchParams(window.location.search);
  const utmParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
  
  try {
    const urlObj = new URL(targetUrl);
    
    utmParams.forEach(param => {
      const value = currentParams.get(param);
      if (value) {
        urlObj.searchParams.set(param, value);
      }
    });
    
    return urlObj.toString();
  } catch {
    return targetUrl;
  }
}

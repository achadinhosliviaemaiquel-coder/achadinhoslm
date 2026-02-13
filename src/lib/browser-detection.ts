// In-app browser detection utilities

export interface BrowserInfo {
  isInAppBrowser: boolean
  browserName: string
  isInstagram: boolean
  isFacebook: boolean
  isTikTok: boolean
  isAndroid: boolean
  isIOS: boolean
  isMobile: boolean
}

export function detectBrowser(): BrowserInfo {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      isInAppBrowser: false,
      browserName: "unknown",
      isInstagram: false,
      isFacebook: false,
      isTikTok: false,
      isAndroid: false,
      isIOS: false,
      isMobile: false,
    }
  }

  const ua = String(navigator.userAgent || (navigator as any).vendor || "")
  const uaLower = ua.toLowerCase()

  // Platforms
  const isAndroid = /android/i.test(ua)
  const isIOS = /iphone|ipad|ipod/i.test(ua)
  const isMobile = isAndroid || isIOS || /mobile/i.test(ua)

  // In-app browsers (best-effort; UAs mudam)
  const isInstagram = /instagram/i.test(ua) // ex: "Instagram 327.0.0.0.45"
  const isFacebook = /FBAN|FBAV|FB_IAB|FBAN\/|FBAV\/|FBSS|FBID/i.test(ua) // inclui variações comuns
  const isTikTok = /tiktok/i.test(ua) || /bytedance/i.test(ua) || /musically/i.test(ua)

  const isInAppBrowser = isInstagram || isFacebook || isTikTok

  let browserName = "browser"
  if (isInstagram) browserName = "instagram"
  else if (isFacebook) browserName = "facebook"
  else if (isTikTok) browserName = "tiktok"

  return {
    isInAppBrowser,
    browserName,
    isInstagram,
    isFacebook,
    isTikTok,
    isAndroid,
    isIOS,
    isMobile,
  }
}

// Generate unique click ID
export function generateClickId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).substring(2, 10)
  return `${timestamp}-${random}`
}

// Store click ID in both cookie and localStorage
export function storeClickId(clickId: string, productSlug: string, store: string) {
  const data = {
    clickId,
    productSlug,
    store,
    timestamp: Date.now(),
  }

  // localStorage
  try {
    localStorage.setItem("affiliate_click", JSON.stringify(data))
  } catch {
    // localStorage not available
  }

  // First-party cookie (7 days expiry)
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `affiliate_click=${encodeURIComponent(
    JSON.stringify(data)
  )}; expires=${expires}; path=/; SameSite=Lax`
}

// Retrieve stored click ID
export function getStoredClickId(): string | null {
  // 1) localStorage
  try {
    const stored = localStorage.getItem("affiliate_click")
    if (stored) {
      const data = JSON.parse(stored)
      return typeof data?.clickId === "string" ? data.clickId : null
    }
  } catch {
    // ignore
  }

  // 2) cookie fallback
  const match = document.cookie.match(/(?:^|;\s*)affiliate_click=([^;]+)/)
  if (match) {
    try {
      const data = JSON.parse(decodeURIComponent(match[1]))
      return typeof data?.clickId === "string" ? data.clickId : null
    } catch {
      return null
    }
  }

  return null
}

// Append click_id to affiliate URL
export function appendClickId(url: string, clickId: string): string {
  try {
    const urlObj = new URL(url)
    urlObj.searchParams.set("click_id", clickId)
    return urlObj.toString()
  } catch {
    const separator = url.includes("?") ? "&" : "?"
    return `${url}${separator}click_id=${encodeURIComponent(clickId)}`
  }
}

const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const
const CLID_PARAMS = ["fbclid", "gclid", "ttclid"] as const

/**
 * Preserve UTM + click IDs from current URL into targetUrl.
 * Útil para manter atribuição em /go e links externos.
 */
export function preserveAttributionParams(targetUrl: string): string {
  if (typeof window === "undefined") return targetUrl

  const currentParams = new URLSearchParams(window.location.search)

  try {
    const urlObj = new URL(targetUrl)

    ;[...UTM_PARAMS, ...CLID_PARAMS].forEach((param) => {
      const value = currentParams.get(param)
      if (value) urlObj.searchParams.set(param, value)
    })

    return urlObj.toString()
  } catch {
    return targetUrl
  }
}

/**
 * Back-compat: mantém a assinatura antiga, mas agora também preserva fbclid/gclid/ttclid.
 */
export function preserveUtmParams(targetUrl: string): string {
  return preserveAttributionParams(targetUrl)
}

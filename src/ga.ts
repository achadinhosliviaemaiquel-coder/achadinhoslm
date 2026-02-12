// Evita conflitos de escopo / HMR
export {}

const GA_ID = import.meta.env.VITE_GA_ID as string | undefined

// ✅ No dev/local: se não tiver VITE_GA_ID, não faz nada
if (!GA_ID) {
  // silencioso de propósito
} else {
  // evita duplicar (HMR / navegações)
  const existing = document.querySelector(
    `script[data-ga="gtag"][data-id="${GA_ID}"]`
  )

  if (!existing) {
    const s = document.createElement("script")
    s.async = true
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
    s.setAttribute("data-ga", "gtag")
    s.setAttribute("data-id", GA_ID)
    document.head.appendChild(s)
  }

  // inicializa GA
  ;(window as any).dataLayer = (window as any).dataLayer || []

  function gtag() {
    ;(window as any).dataLayer.push(arguments)
  }

  ;(window as any).gtag = (window as any).gtag || gtag

  ;(window as any).gtag("js", new Date())
  ;(window as any).gtag("config", GA_ID, {
    anonymize_ip: true,
    send_page_view: true,
  })
}

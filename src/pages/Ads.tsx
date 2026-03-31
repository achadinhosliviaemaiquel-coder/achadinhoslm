import { useEffect, useRef, useState, useCallback } from 'react'

// ─── Constantes ────────────────────────────────────────────────────────────
const PIXEL_ID      = '931591442937757'
const WHATSAPP_LINK = 'https://chat.whatsapp.com/Bvyh4RUuNA32qVtlHgiZJu'

// ─── Tipos ─────────────────────────────────────────────────────────────────
interface Deal        { emoji: string; badge: string; name: string; discount: string; originalPrice: string; finalPrice: string; installments?: string; subscription?: string; urgency: string; link: string; store: 'amazon' | 'mercadolivre' }
interface Benefit     { icon: string; title: string; desc: string }
interface Testimonial { icon: string; name: string; text: string }
interface Notification { name: string; city: string; time: string; avatar: string }

// ─── Meta Pixel ────────────────────────────────────────────────────────────
declare global { interface Window { fbq: (...args: unknown[]) => void; _fbq: unknown } }

function initPixel(): void {
  if (typeof window === 'undefined' || window.fbq) return
  ;(function (f: Window & typeof globalThis, b: Document, e: string, v: string) {
    const n = function (...args: unknown[]) {
      ;(n as unknown as { queue: unknown[] }).queue
        ? (n as unknown as { queue: unknown[] }).queue.push(args)
        : (n as unknown as { callMethod: (...a: unknown[]) => void }).callMethod(...args)
    } as unknown as typeof window.fbq
    if (!f._fbq) f._fbq = n; f.fbq = n
    ;(n as unknown as { push: typeof n }).push = n
    ;(n as unknown as { loaded: boolean }).loaded = true
    ;(n as unknown as { version: string }).version = '2.0'
    ;(n as unknown as { queue: unknown[] }).queue = []
    const t = b.createElement(e) as HTMLScriptElement
    t.async = true; t.src = v
    const s = b.getElementsByTagName(e)[0]; s.parentNode?.insertBefore(t, s)
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js')
  window.fbq('init', PIXEL_ID); window.fbq('track', 'PageView')
}

const px = {
  viewContent: (name: string, category = 'Promoções') => window.fbq?.('track', 'ViewContent', { content_name: name, content_category: category }),
  lead: () => window.fbq?.('track', 'Lead'),
}

// ─── Dados de notificações ──────────────────────────────────────────────────
const NAMES   = ['Ana Paula','Carlos','Juliana','Marcos','Fernanda','Rafael','Camila','Bruno','Larissa','Diego','Patrícia','Lucas','Beatriz','Gabriel','Aline','Rodrigo','Isabela','Felipe','Mariana','Eduardo','Vanessa','Thiago','Renata','Guilherme','Amanda','André','Letícia','Leonardo','Priscila','Matheus']
const CITIES  = ['São Paulo, SP','Rio de Janeiro, RJ','Belo Horizonte, MG','Curitiba, PR','Porto Alegre, RS','Salvador, BA','Fortaleza, CE','Recife, PE','Manaus, AM','Goiânia, GO','Campinas, SP','Florianópolis, SC','Natal, RN','Belém, PA','São Luís, MA','Teresina, PI','Campo Grande, MS','João Pessoa, PB','Aracaju, SE','Maceió, AL','Brasília, DF','Uberlândia, MG','Sorocaba, SP','São Bernardo, SP','Osasco, SP']
const AVATARS = ['👩','👨','👩🏽','👨🏽','👩🏻','👨🏻','👩🏾','👨🏾','🧑','👧','🧒🏽','👦','🧑🏻','👩🏿','👨🏿']
const TIMES   = ['agora mesmo','há 1 min','há 2 min','há 3 min']

function randomFrom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }

function generateNotification(): Notification {
  return { name: randomFrom(NAMES), city: randomFrom(CITIES), time: randomFrom(TIMES), avatar: randomFrom(AVATARS) }
}

// ─── Dados de ofertas ───────────────────────────────────────────────────────
const deals: Deal[] = [
  { emoji: '😱', badge: 'ACHADO DO DIA',     name: 'NIVEA Sérum Facial Cellular Luminous 630® ANTIMARCAS Acne 30ml',                                                                discount: '-79% OFF', originalPrice: 'R$ 129,90', finalPrice: 'R$ 27,50',  urgency: '⏳ Promoção por tempo limitado!', link: 'https://amzn.to/4bGHJl9',  store: 'amazon' },
  { emoji: '🎯', badge: 'OFERTA IMPERDÍVEL', name: "Kit L'Oréal Paris Elseve Glycolic Gloss — 5 Produtos para Brilho e Alinhamento",                                                discount: '',         originalPrice: 'R$ 99,90',  finalPrice: 'R$ 99,90',  subscription: 'Recorrência: R$ 94,90 (Assine e Economize)', urgency: '⏳ Corre antes que acabe!',       link: 'https://amzn.to/4rLH0VP',  store: 'amazon' },
  { emoji: '👀', badge: 'PREÇO DE BANANA',   name: 'Kérastase Genesis Bain Hydra-Fortifiant Shampoo Antiqueda — Flor de Edelweiss e Raiz de Gengibre, 250ml',                      discount: '-22% OFF', originalPrice: 'R$ 205,00', finalPrice: 'R$ 160,10', installments: '5x de R$ 32,02 sem juros',                    urgency: '👉 Aproveita agora!',             link: 'https://amzn.to/3PWwAp1',  store: 'amazon' },
  { emoji: '🤑', badge: 'TÁ BARATO DEMAIS',  name: "L'Oréal Paris Elseve Liso dos Sonhos — Sérum Leave-in Antifrizz e Protetor Térmico, 100ml",                                    discount: '-30% OFF', originalPrice: 'R$ 49,90',  finalPrice: 'R$ 34,99',  urgency: '😱 Não vai durar muito!',        link: 'https://amzn.to/4rR58Xc',  store: 'amazon' },
  { emoji: '😱', badge: 'TÁ BARATO DEMAIS',  name: 'Kérastase Résistance Thérapiste — Máscara Reconstrução Profunda para Cabelos Danificados, 200ml',                              discount: '-44% OFF', originalPrice: 'R$ 391,90', finalPrice: 'R$ 219,51', urgency: '👉 Aproveita agora!',             link: 'https://meli.la/1CJBGJA',  store: 'mercadolivre' },
]

const benefits: Benefit[] = [
  { icon: '🔥', title: 'Ofertas Relâmpago',   desc: 'Promoções que somem em horas, direto no seu WhatsApp' },
  { icon: '💰', title: 'Economia Real',        desc: 'Até 80% de desconto em Amazon, Shopee e Mercado Livre' },
  { icon: '📦', title: 'Curadoria Diária',     desc: 'Só os melhores achadinhos, sem spam e sem enganação' },
  { icon: '⚡', title: 'Alertas Instantâneos', desc: 'Seja o primeiro a saber quando uma oferta aparecer' },
]

const testimonials: Testimonial[] = [
  { icon: '👩', name: 'Ana Paula', text: 'Economizei R$340 só no primeiro mês no grupo!' },
  { icon: '👨', name: 'Carlos M.', text: 'Melhor grupo de promoções que já participei, sério.' },
  { icon: '👩', name: 'Renata S.', text: 'Comprei meu celular por R$200 a menos graças a eles.' },
]

// ─── Ícone WhatsApp ────────────────────────────────────────────────────────
function WhatsAppIcon(): JSX.Element {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.822 6.5L4 29l7.75-1.793A12.94 12.94 0 0016 28c6.627 0 12-5.373 12-12S22.627 3 16 3zm-3.185 7.4c-.295-.657-.605-.671-.886-.683-.23-.01-.492-.01-.755-.01-.263 0-.69.099-1.051.492-.362.394-1.38 1.348-1.38 3.29 0 1.94 1.413 3.816 1.609 4.08.197.263 2.748 4.352 6.766 5.924 3.347 1.32 4.018 1.057 4.742.991.723-.066 2.333-.953 2.662-1.875.329-.921.329-1.711.23-1.875-.099-.165-.362-.263-.757-.46-.395-.197-2.334-1.152-2.695-1.283-.362-.132-.624-.197-.887.197-.263.394-1.018 1.283-1.248 1.546-.23.263-.46.296-.854.099-.395-.197-1.666-.614-3.174-1.96-1.173-1.046-1.966-2.339-2.196-2.733-.23-.394-.025-.608.172-.804.178-.177.395-.46.592-.69.197-.23.263-.394.395-.657.132-.263.066-.493-.033-.69-.1-.197-.864-2.146-1.213-2.909z" fill="#000"/>
    </svg>
  )
}

// ─── Popup de prova social ─────────────────────────────────────────────────
function SocialProofPopup(): JSX.Element {
  const [notif, setNotif]     = useState<Notification | null>(null)
  const [visible, setVisible] = useState<boolean>(false)
  const timerRef              = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback(() => {
    setNotif(generateNotification())
    setVisible(true)

    // Fecha após 4s
    timerRef.current = setTimeout(() => {
      setVisible(false)
      // Próximo disparo: entre 8s e 18s
      const next = 8000 + Math.random() * 10000
      timerRef.current = setTimeout(show, next)
    }, 4000)
  }, [])

  useEffect(() => {
    // Primeiro popup: aparece entre 3s e 6s após carregar
    const delay = 3000 + Math.random() * 3000
    timerRef.current = setTimeout(show, delay)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [show])

  if (!notif) return <></>

  return (
    <div className={`ads-notif${visible ? ' ads-notif-in' : ' ads-notif-out'}`} role="status" aria-live="polite">
      <div className="ads-notif-avatar">{notif.avatar}</div>
      <div className="ads-notif-body">
        <div className="ads-notif-title">
          <span className="ads-notif-name">{notif.name}</span> entrou no grupo!
        </div>
        <div className="ads-notif-meta">
          <span className="ads-notif-city">📍 {notif.city}</span>
          <span className="ads-notif-dot">·</span>
          <span className="ads-notif-time">{notif.time}</span>
        </div>
      </div>
      <div className="ads-notif-icon">
        <svg width="16" height="16" viewBox="0 0 32 32" fill="none">
          <path fillRule="evenodd" clipRule="evenodd" d="M16 3C9.373 3 4 8.373 4 15c0 2.385.668 4.61 1.822 6.5L4 29l7.75-1.793A12.94 12.94 0 0016 28c6.627 0 12-5.373 12-12S22.627 3 16 3zm-3.185 7.4c-.295-.657-.605-.671-.886-.683-.23-.01-.492-.01-.755-.01-.263 0-.69.099-1.051.492-.362.394-1.38 1.348-1.38 3.29 0 1.94 1.413 3.816 1.609 4.08.197.263 2.748 4.352 6.766 5.924 3.347 1.32 4.018 1.057 4.742.991.723-.066 2.333-.953 2.662-1.875.329-.921.329-1.711.23-1.875-.099-.165-.362-.263-.757-.46-.395-.197-2.334-1.152-2.695-1.283-.362-.132-.624-.197-.887.197-.263.394-1.018 1.283-1.248 1.546-.23.263-.46.296-.854.099-.395-.197-1.666-.614-3.174-1.96-1.173-1.046-1.966-2.339-2.196-2.733-.23-.394-.025-.608.172-.804.178-.177.395-.46.592-.69.197-.23.263-.394.395-.657.132-.263.066-.493-.033-.69-.1-.197-.864-2.146-1.213-2.909z" fill="#25D366"/>
        </svg>
      </div>
    </div>
  )
}

// ─── Carrossel de promoções ────────────────────────────────────────────────
function DealsCarousel(): JSX.Element {
  const [active, setActive]   = useState<number>(0)
  const touchStartX           = useRef<number>(0)
  const touchStartY           = useRef<number>(0)
  const isDragging            = useRef<boolean>(false)
  const total                 = deals.length

  function goTo(index: number): void {
    const next = (index + total) % total
    setActive(next)
    px.viewContent(deals[next].name, 'Oferta')
  }

  function onTouchStart(e: React.TouchEvent): void { touchStartX.current = e.touches[0].clientX; touchStartY.current = e.touches[0].clientY; isDragging.current = false }
  function onTouchMove (e: React.TouchEvent): void { const dx = Math.abs(e.touches[0].clientX - touchStartX.current); const dy = Math.abs(e.touches[0].clientY - touchStartY.current); if (dx > dy && dx > 8) isDragging.current = true }
  function onTouchEnd  (e: React.TouchEvent): void { if (!isDragging.current) return; const dx = e.changedTouches[0].clientX - touchStartX.current; if (Math.abs(dx) > 50) goTo(active + (dx < 0 ? 1 : -1)) }

  const deal      = deals[active]
  const storeCls  = deal.store === 'amazon' ? 'ads-store-amazon' : 'ads-store-ml'
  const storeLabel = deal.store === 'amazon' ? '🛒 Ver na Amazon' : '🛒 Ver no Mercado Livre'

  return (
    <div className="ads-carousel-wrap">
      <div className="ads-carousel-card" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <div className="ads-deal-top">
          <span className="ads-deal-badge">{deal.emoji} {deal.badge}</span>
          {deal.discount && <span className="ads-deal-discount">{deal.discount}</span>}
        </div>
        <p className="ads-deal-name">{deal.name}</p>
        <div className="ads-deal-prices">
          <span className="ads-deal-original">De: {deal.originalPrice}</span>
          <span className="ads-deal-final">{deal.finalPrice}</span>
          {deal.installments && <span className="ads-deal-installments">💳 {deal.installments}</span>}
          {deal.subscription  && <span className="ads-deal-subscription">🔄 {deal.subscription}</span>}
        </div>
        <p className="ads-deal-urgency">{deal.urgency}</p>
        <button className={`ads-deal-btn ${storeCls}`} onClick={() => { px.viewContent(deal.name, 'Oferta'); window.open(deal.link, '_blank', 'noopener,noreferrer') }}>
          {storeLabel} →
        </button>
      </div>
      <button className="ads-carousel-arrow ads-arrow-prev" onClick={() => goTo(active - 1)} aria-label="Anterior">‹</button>
      <button className="ads-carousel-arrow ads-arrow-next" onClick={() => goTo(active + 1)} aria-label="Próximo">›</button>
      <div className="ads-carousel-dots">
        {deals.map((_, i) => <button key={i} className={`ads-dot${i === active ? ' ads-dot-active' : ''}`} onClick={() => goTo(i)} aria-label={`Oferta ${i + 1}`} />)}
      </div>
      <p className="ads-carousel-counter">{active + 1} / {total}</p>
    </div>
  )
}

// ─── Componente principal ──────────────────────────────────────────────────
export default function Ads(): JSX.Element {
  const [visible, setVisible] = useState<boolean>(false)
  const [count,   setCount]   = useState<number>(0)
  const [pulse,   setPulse]   = useState<boolean>(false)

  useEffect(() => {
    initPixel()
    const viewTimer = setTimeout(() => px.viewContent('Grupo WhatsApp Saiu Promoção'), 2000)
    requestAnimationFrame(() => setVisible(true))
    const target = 4817, duration = 1800, start = Date.now()
    const counter = setInterval(() => {
      const p = Math.min((Date.now() - start) / duration, 1)
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target))
      if (p >= 1) clearInterval(counter)
    }, 16)
    const pulseInterval = setInterval(() => { setPulse(true); setTimeout(() => setPulse(false), 600) }, 4000)
    return () => { clearTimeout(viewTimer); clearInterval(counter); clearInterval(pulseInterval) }
  }, [])

  function handleCTA(): void { px.lead(); window.open(WHATSAPP_LINK, '_blank', 'noopener,noreferrer') }

  return (
    <>
      <noscript><img height="1" width="1" style={{ display: 'none' }} src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`} alt="" /></noscript>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&display=swap');

        .ads-root*,.ads-root *::before,.ads-root *::after{box-sizing:border-box;margin:0;padding:0}
        .ads-root{
          --green:#25D366;--green2:#1db954;--dark:#0a0a0a;--card:#111;
          --border:#222;--text:#e8e8e8;--muted:#888;--accent:#FFD700;--red:#ff4444;
          min-height:100vh;background:var(--dark);color:var(--text);
          font-family:'DM Sans',sans-serif;
          display:flex;flex-direction:column;align-items:center;overflow-x:hidden;
          opacity:0;transform:translateY(16px);transition:opacity .6s ease,transform .6s ease;
        }
        .ads-root.ads-in{opacity:1;transform:translateY(0)}

        /* ── POPUP DE PROVA SOCIAL ── */
        .ads-notif{
          position:fixed;bottom:24px;left:20px;z-index:9999;
          display:flex;align-items:center;gap:12px;
          background:#1a1a1a;
          border:1px solid #2a2a2a;
          border-left:3px solid var(--green);
          border-radius:14px;
          padding:12px 16px;
          max-width:300px;
          box-shadow:0 8px 32px rgba(0,0,0,.6);
          pointer-events:none;
          /* estado inicial — fora de cena */
          opacity:0;
          transform:translateX(-120%);
          transition:opacity .4s cubic-bezier(.22,1,.36,1), transform .4s cubic-bezier(.22,1,.36,1);
        }
        .ads-notif.ads-notif-in{
          opacity:1;
          transform:translateX(0);
        }
        .ads-notif.ads-notif-out{
          opacity:0;
          transform:translateX(-120%);
        }
        .ads-notif-avatar{
          width:38px;height:38px;
          background:rgba(37,211,102,.12);
          border:1px solid rgba(37,211,102,.25);
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:1.3rem;flex-shrink:0;
        }
        .ads-notif-body{display:flex;flex-direction:column;gap:3px;flex:1;min-width:0}
        .ads-notif-title{font-size:.82rem;color:#e8e8e8;line-height:1.3}
        .ads-notif-name{font-weight:700;color:#fff}
        .ads-notif-meta{display:flex;align-items:center;gap:5px;font-size:.73rem;color:#666}
        .ads-notif-dot{color:#444}
        .ads-notif-icon{flex-shrink:0}

        /* ── HERO ── */
        .ads-hero{width:100%;max-width:680px;padding:56px 24px 40px;display:flex;flex-direction:column;align-items:center;text-align:center}
        .ads-badge{display:inline-flex;align-items:center;gap:6px;background:rgba(37,211,102,.12);border:1px solid rgba(37,211,102,.3);border-radius:100px;padding:6px 14px;font-size:13px;font-weight:600;color:var(--green);letter-spacing:.03em;margin-bottom:28px}
        .ads-badge-dot{width:7px;height:7px;background:var(--green);border-radius:50%;animation:ads-blink 1.4s infinite}
        @keyframes ads-blink{0%,100%{opacity:1}50%{opacity:.2}}
        .ads-title{font-family:'Syne',sans-serif;font-size:clamp(2rem,8vw,3.4rem);font-weight:800;line-height:1.08;letter-spacing:-.02em;color:#fff;margin-bottom:20px}
        .ads-title span{color:var(--green)}
        .ads-sub{font-size:clamp(1rem,3.5vw,1.15rem);color:var(--muted);line-height:1.65;max-width:480px;margin-bottom:36px}
        .ads-counter{display:flex;align-items:center;gap:10px;background:var(--card);border:1px solid var(--border);border-radius:16px;padding:14px 22px;margin-bottom:32px}
        .ads-counter-num{font-family:'Syne',sans-serif;font-size:1.6rem;font-weight:800;color:var(--green)}
        .ads-counter-label{font-size:.9rem;color:var(--muted)}

        /* ── CTA ── */
        .ads-cta{display:flex;align-items:center;justify-content:center;gap:10px;background:var(--green);color:#000;font-family:'Syne',sans-serif;font-size:1.1rem;font-weight:700;border:none;border-radius:16px;padding:18px 36px;cursor:pointer;width:100%;max-width:420px;transition:transform .18s,box-shadow .18s,background .18s}
        .ads-cta:hover{background:var(--green2);transform:translateY(-2px);box-shadow:0 8px 32px rgba(37,211,102,.35)}
        .ads-cta:active{transform:translateY(0)}
        .ads-cta.ads-pulse{animation:ads-pulse-btn .6s ease}
        @keyframes ads-pulse-btn{0%{box-shadow:0 0 0 0 rgba(37,211,102,.6)}70%{box-shadow:0 0 0 18px rgba(37,211,102,0)}100%{box-shadow:0 0 0 0 rgba(37,211,102,0)}}
        .ads-cta-arrow{transition:transform .18s}
        .ads-cta:hover .ads-cta-arrow{transform:translateX(4px)}
        .ads-note{margin-top:12px;font-size:.82rem;color:var(--muted)}

        .ads-divider{width:100%;max-width:680px;height:1px;background:var(--border);margin:8px 0}
        .ads-section{width:100%;max-width:680px;padding:40px 24px}
        .ads-section-title{font-family:'Syne',sans-serif;font-size:1.35rem;font-weight:700;color:#fff;margin-bottom:8px;text-align:center}
        .ads-section-sub{text-align:center;color:var(--muted);font-size:.88rem;margin-bottom:28px}

        /* ── CARROSSEL ── */
        .ads-carousel-wrap{position:relative;width:100%;padding:0 0 52px;user-select:none}
        .ads-carousel-card{background:var(--card);border:1px solid var(--border);border-radius:20px;padding:24px;display:flex;flex-direction:column;gap:12px;min-height:260px;touch-action:pan-y;animation:ads-fade-slide .3s ease}
        @keyframes ads-fade-slide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:translateX(0)}}
        .ads-deal-top{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
        .ads-deal-badge{font-size:.78rem;font-weight:700;letter-spacing:.04em;color:var(--accent);text-transform:uppercase}
        .ads-deal-discount{background:rgba(255,68,68,.15);color:var(--red);border:1px solid rgba(255,68,68,.3);border-radius:8px;padding:3px 10px;font-size:.82rem;font-weight:700}
        .ads-deal-name{font-size:.97rem;color:#fff;line-height:1.55;font-weight:500;flex:1}
        .ads-deal-prices{display:flex;flex-direction:column;gap:3px}
        .ads-deal-original{font-size:.82rem;color:var(--muted);text-decoration:line-through}
        .ads-deal-final{font-family:'Syne',sans-serif;font-size:1.7rem;font-weight:800;color:var(--green);line-height:1.1}
        .ads-deal-installments{font-size:.82rem;color:var(--muted)}
        .ads-deal-subscription{font-size:.82rem;color:#7ecef4}
        .ads-deal-urgency{font-size:.85rem;color:var(--muted);font-style:italic}
        .ads-deal-btn{display:flex;align-items:center;justify-content:center;border:none;border-radius:12px;padding:13px 20px;font-family:'Syne',sans-serif;font-size:.95rem;font-weight:700;cursor:pointer;transition:opacity .18s,transform .18s;margin-top:4px;width:100%}
        .ads-deal-btn:hover{opacity:.88;transform:translateY(-1px)}
        .ads-store-amazon{background:#FF9900;color:#000}
        .ads-store-ml{background:#FFE600;color:#000}
        .ads-carousel-arrow{position:absolute;top:50%;transform:translateY(calc(-50% - 26px));background:rgba(255,255,255,.06);border:1px solid var(--border);color:#fff;border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;line-height:1;cursor:pointer;transition:background .18s;z-index:2}
        .ads-carousel-arrow:hover{background:rgba(37,211,102,.15);border-color:rgba(37,211,102,.4)}
        .ads-arrow-prev{left:-14px}
        .ads-arrow-next{right:-14px}
        @media(max-width:500px){.ads-arrow-prev{left:0}.ads-arrow-next{right:0}}
        .ads-carousel-dots{display:flex;justify-content:center;gap:7px;position:absolute;bottom:20px;left:0;right:0}
        .ads-dot{width:8px;height:8px;border-radius:50%;border:none;background:var(--border);cursor:pointer;transition:background .2s,transform .2s;padding:0}
        .ads-dot-active{background:var(--green);transform:scale(1.3)}
        .ads-carousel-counter{position:absolute;bottom:22px;right:4px;font-size:.75rem;color:#444}

        /* ── BENEFÍCIOS ── */
        .ads-benefits{display:grid;grid-template-columns:1fr 1fr;gap:14px}
        @media(max-width:480px){.ads-benefits{grid-template-columns:1fr}}
        .ads-benefit-card{background:var(--card);border:1px solid var(--border);border-radius:16px;padding:20px;display:flex;flex-direction:column;gap:8px;transition:border-color .2s,transform .2s}
        .ads-benefit-card:hover{border-color:rgba(37,211,102,.35);transform:translateY(-2px)}
        .ads-benefit-icon{font-size:1.8rem}
        .ads-benefit-title{font-weight:600;font-size:.97rem;color:#fff}
        .ads-benefit-desc{font-size:.85rem;color:var(--muted);line-height:1.5}

        /* ── DEPOIMENTOS ── */
        .ads-testimonials{display:flex;flex-direction:column;gap:12px}
        .ads-testimonial{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:16px 20px;display:flex;gap:14px;align-items:flex-start}
        .ads-avatar{width:40px;height:40px;background:rgba(37,211,102,.15);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0}
        .ads-t-name{font-weight:600;font-size:.9rem;color:#fff;margin-bottom:4px}
        .ads-t-text{font-size:.88rem;color:var(--muted);line-height:1.5}
        .ads-stars{color:var(--accent);font-size:.8rem;margin-bottom:3px}

        /* ── BOTTOM CTA ── */
        .ads-bottom{width:100%;max-width:680px;padding:32px 24px 56px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
        .ads-bottom-title{font-family:'Syne',sans-serif;font-size:1.5rem;font-weight:800;color:#fff}
        .ads-bottom-sub{font-size:.92rem;color:var(--muted);margin-bottom:8px}

        /* ── FOOTER ── */
        .ads-footer{width:100%;border-top:1px solid var(--border);padding:20px 24px;text-align:center;font-size:.78rem;color:#555}
        .ads-footer a{color:#555;text-decoration:none}
        .ads-footer a:hover{color:var(--muted)}
      `}</style>

      {/* POPUP — fora do main, fixed no viewport */}
      <SocialProofPopup />

      <main className={`ads-root${visible ? ' ads-in' : ''}`}>

        <section className="ads-hero">
          <div className="ads-badge"><span className="ads-badge-dot" />Grupo Aberto Agora</div>
          <h1 className="ads-title">Economize todo dia com os melhores<br /><span>achadinhos do Brasil</span></h1>
          <p className="ads-sub">Promoções reais da Amazon, Shopee e Mercado Livre direto no seu WhatsApp. Sem spam. Só achado bom.</p>
          <div className="ads-counter">
            <span className="ads-counter-num">{count.toLocaleString('pt-BR')}+</span>
            <span className="ads-counter-label">pessoas já economizando no grupo</span>
          </div>
          <button className={`ads-cta${pulse ? ' ads-pulse' : ''}`} onClick={handleCTA}>
            <WhatsAppIcon />Entrar no Grupo Grátis<span className="ads-cta-arrow">→</span>
          </button>
          <p className="ads-note">✅ 100% gratuito &nbsp;·&nbsp; 🔕 Sem spam &nbsp;·&nbsp; 📲 Saia quando quiser</p>
        </section>

        <div className="ads-divider" />

        <section className="ads-section">
          <h2 className="ads-section-title">🔥 Promoções Absurdas de Hoje</h2>
          <p className="ads-section-sub">Deslize para ver todas as ofertas — somem rápido!</p>
          <DealsCarousel />
        </section>

        <div className="ads-divider" />

        <section className="ads-section">
          <h2 className="ads-section-title">Por que entrar no grupo?</h2>
          <div className="ads-benefits">
            {benefits.map((b) => (
              <div key={b.title} className="ads-benefit-card">
                <span className="ads-benefit-icon">{b.icon}</span>
                <span className="ads-benefit-title">{b.title}</span>
                <span className="ads-benefit-desc">{b.desc}</span>
              </div>
            ))}
          </div>
        </section>

        <div className="ads-divider" />

        <section className="ads-section">
          <h2 className="ads-section-title">O que dizem os membros</h2>
          <div className="ads-testimonials">
            {testimonials.map((t) => (
              <div key={t.name} className="ads-testimonial">
                <div className="ads-avatar">{t.icon}</div>
                <div>
                  <div className="ads-stars">★★★★★</div>
                  <div className="ads-t-name">{t.name}</div>
                  <div className="ads-t-text">"{t.text}"</div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="ads-divider" />

        <section className="ads-bottom">
          <h2 className="ads-bottom-title">Não fique de fora 🔥</h2>
          <p className="ads-bottom-sub">A próxima oferta relâmpago pode aparecer a qualquer momento.<br />Entre agora e ative as notificações.</p>
          <button className={`ads-cta${pulse ? ' ads-pulse' : ''}`} onClick={handleCTA}>
            <WhatsAppIcon />Quero Economizar Agora<span className="ads-cta-arrow">→</span>
          </button>
          <p className="ads-note">✅ 100% gratuito &nbsp;·&nbsp; 🔕 Sem spam &nbsp;·&nbsp; 📲 Saia quando quiser</p>
        </section>

        <footer className="ads-footer">
          © {new Date().getFullYear()} Saiu Promoção &nbsp;·&nbsp;{' '}
          <a href="https://saiupromo.com.br">saiupromo.com.br</a><br />
          Este site pode conter links de afiliados. Ao comprar, você apoia o canal sem pagar a mais por isso.
        </footer>

      </main>
    </>
  )
}
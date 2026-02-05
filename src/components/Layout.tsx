import { Header } from './Header';
import { Footer } from './Footer';
import { Instagram, Youtube } from "lucide-react";
import { ScrollToTop } from "@/components/ScrollToTop";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { useEffect, useMemo } from "react";

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface LayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  breadcrumb?: BreadcrumbItem[];
}

// ✅ evita crash caso algum dia rode em ambiente sem window (ou testes)
function getBaseUrlSafe() {
  try {
    const host = window.location.hostname;
    if (host.includes("vercel.app")) return "https://achadinhoslm.vercel.app";
    return "https://achadinhoslm.com.br";
  } catch {
    // fallback (build/test)
    return "https://achadinhoslm.com.br";
  }
}

export function Layout({ children, showFooter = true, breadcrumb = [] }: LayoutProps) {
  const location = useLocation();

  const BASE_URL = useMemo(() => getBaseUrlSafe(), []);
  const fullPath = `${location.pathname}${location.search || ""}`; // ✅ inclui ?q=...
  const canonicalUrl = `${BASE_URL}${fullPath}`;

  const breadcrumbSchema =
    breadcrumb.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: breadcrumb.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: `${BASE_URL}${item.url}`,
          })),
        }
      : null;

  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Achadinhos LM",
    url: BASE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${BASE_URL}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Achadinhos LM",
    url: BASE_URL,
    sameAs: [
      "https://www.instagram.com/achadosliviamaiquel/",
      "https://www.tiktok.com/@achadosliviamaiquel",
      "https://www.youtube.com/@AchadinhosLiviaeMaiquel",
    ],
  };

  // ⭐ GA4 — rastrear mudança de rota (inclui querystring)
  useEffect(() => {
    if (window.gtag) {
      window.gtag('config', 'G-L8J2YZRFFP', {
        page_path: fullPath,
      });
    }
  }, [fullPath]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <html lang="pt-BR" />
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="index, follow, max-image-preview:large" />
        <meta name="theme-color" content="#ffffff" />
        <link rel="canonical" href={canonicalUrl} />

        {/* ===== Open Graph GLOBAL ===== */}
        <meta property="og:site_name" content="Achadinhos LM" />
        <meta property="og:locale" content="pt_BR" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={canonicalUrl} />
        <meta property="og:title" content="Achadinhos LM & Promoções" />
        <meta property="og:description" content="Ofertas da Shopee, Amazon e Mercado Livre todos os dias." />
        <meta property="og:image" content={`${BASE_URL}/og-home.jpg`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />

        {/* ===== Twitter ===== */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Achadinhos LM & Promoções" />
        <meta name="twitter:description" content="Ofertas da Shopee, Amazon e Mercado Livre todos os dias." />
        <meta name="twitter:image" content={`${BASE_URL}/og-home.jpg`} />

        {/* ===== Schemas ===== */}
        <script type="application/ld+json">
          {JSON.stringify(websiteSchema)}
        </script>
        <script type="application/ld+json">
          {JSON.stringify(organizationSchema)}
        </script>

        {breadcrumbSchema && (
          <script type="application/ld+json">
            {JSON.stringify(breadcrumbSchema)}
          </script>
        )}

        {/* ===== GA4 ===== */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-L8J2YZRFFP"></script>
        <script>
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            window.gtag = gtag;
            gtag('js', new Date());
            gtag('config', 'G-L8J2YZRFFP');
          `}
        </script>
      </Helmet>

      <ScrollToTop />
      <Header />

      <main className="flex-1 w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      <div className="flex justify-center gap-6 py-6 text-muted-foreground">
        <a
          href="https://www.instagram.com/achadosliviamaiquel/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-pink-500 transition-colors"
        >
          <Instagram size={22} />
        </a>

        <a
          href="https://www.tiktok.com/@achadosliviamaiquel"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-black transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor">
            <path d="M168 24v104.3a72 72 0 1 1-72-72c4.4 0 8.7.4 12.9 1.1v37.6a36 36 0 1 0 36.1 36V24h23z" />
          </svg>
        </a>

        <a
          href="https://www.youtube.com/@AchadinhosLiviaeMaiquel"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-red-500 transition-colors"
        >
          <Youtube size={22} />
        </a>
      </div>

      {showFooter && <Footer />}
    </div>
  );
}

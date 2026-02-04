import { Header } from './Header';
import { Footer } from './Footer';
import { Instagram, Youtube } from "lucide-react";
import { ScrollToTop } from "@/components/ScrollToTop";
import { Helmet } from "react-helmet-async";
import { useLocation } from "react-router-dom";
import { useEffect } from "react"; // ⭐ GA

interface BreadcrumbItem {
  name: string;
  url: string;
}

interface LayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
  breadcrumb?: BreadcrumbItem[];
}

export function Layout({ children, showFooter = true, breadcrumb = [] }: LayoutProps) {
  const location = useLocation();
  const canonicalUrl = `https://achadinhoslm.com.br${location.pathname}`;
  const BASE_URL = "https://achadinhoslm.com.br";

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

  // ⭐ GA4 — rastrear mudança de rota
  useEffect(() => {
    if (window.gtag) {
      window.gtag('config', 'G-L8J2YZRFFP', {
        page_path: location.pathname,
      });
    }
  }, [location]);

  return (
    <div className="min-h-screen flex flex-col bg-background">

      <Helmet>
        <link rel="canonical" href={canonicalUrl} />

        {breadcrumbSchema && (
          <script type="application/ld+json">
            {JSON.stringify(breadcrumbSchema)}
          </script>
        )}

        {/* ⭐ GOOGLE ANALYTICS */}
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

      <main
        className="
        flex-1 
        w-full 
        max-w-[1000px]
        mx-auto 
        px-4 
        sm:px-6 
        lg:px-8
        py-6
      "
      >
        {children}
      </main>

      <div className="flex justify-center gap-6 py-6 text-muted-foreground">
        <a href="https://www.instagram.com/achadosliviamaiquel/" target="_blank" rel="noopener noreferrer" className="hover:text-pink-500 transition-colors">
          <Instagram size={22} />
        </a>

        <a href="https://www.tiktok.com/@achadosliviamaiquel" target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">
          <svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor">
            <path d="M168 24v104.3a72 72 0 1 1-72-72c4.4 0 8.7.4 12.9 1.1v37.6a36 36 0 1 0 36.1 36V24h23z" />
          </svg>
        </a>

        <a href="https://www.youtube.com/@AchadinhosLiviaeMaiquel" target="_blank" rel="noopener noreferrer" className="hover:text-red-500 transition-colors">
          <Youtube size={22} />
        </a>
      </div>

      {showFooter && <Footer />}
    </div>
  );
}

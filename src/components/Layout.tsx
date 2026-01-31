import { Header } from './Header';
import { Footer } from './Footer';
import { Instagram, Youtube } from "lucide-react";

interface LayoutProps {
  children: React.ReactNode;
  showFooter?: boolean;
}

export function Layout({ children, showFooter = true }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1 container max-w-mobile mx-auto px-4 py-6">
        {children}
      </main>

      {/* Redes sociais */}
      <div className="flex justify-center gap-6 py-4 text-muted-foreground">

        {/* Instagram */}
        <a
          href="https://www.instagram.com/achadosliviamaiquel/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-pink-500 transition-colors"
        >
          <Instagram size={22} />
        </a>

        {/* TikTok (SVG oficial) */}
        <a
          href="https://www.tiktok.com/@achadosliviamaiquel"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-black transition-colors"
        >
          <svg width="22" height="22" viewBox="0 0 256 256" fill="currentColor">
            <path d="M168 24v104.3a72 72 0 1 1-72-72c4.4 0 8.7.4 12.9 1.1v37.6a36 36 0 1 0 36.1 36V24h23z"/>
          </svg>
        </a>

        {/* YouTube */}
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
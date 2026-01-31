import { Header } from './Header';
import { Footer } from './Footer';
import { Instagram, Youtube, MessageCircle, Send } from "lucide-react";

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

        {/* TikTok (ícone alternativo) */}
        <a
          href="https://www.tiktok.com/@achadosliviamaiquel"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-black transition-colors"
        >
          <Send size={22} />
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
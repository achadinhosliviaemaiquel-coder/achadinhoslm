import { Header } from './Header';
import { Footer } from './Footer';

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
      <div className="flex justify-center gap-6 py-4 text-muted-foreground text-sm">
        <a href="https://www.instagram.com/achadosliviamaiquel/" target="_blank" rel="noopener noreferrer">📸 Instagram</a>
        <a href="https://www.tiktok.com/@achadosliviamaiquel" target="_blank" rel="noopener noreferrer">🎵 TikTok</a>
        <a href="https://www.youtube.com/@AchadinhosLiviaeMaiquel" target="_blank" rel="noopener noreferrer">▶️ YouTube</a>
      </div>

      {showFooter && <Footer />}
    </div>
  );
}
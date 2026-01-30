import { Link } from 'react-router-dom';

export function Footer() {
  return (
    <footer className="bg-card border-t border-border mt-auto">
      <div className="container max-w-mobile mx-auto px-4 py-6">
        <div className="text-center space-y-4">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="text-xl">🛍️</span>
            <span className="font-semibold text-foreground">Achados & Ofertas</span>
          </Link>
          
          {/* Disclaimer */}
          <p className="text-xs text-muted-foreground leading-relaxed">
            Este site contém links de afiliados. Ao clicar e comprar, 
            podemos receber uma pequena comissão sem custo adicional para você. 
            Obrigado por apoiar nosso trabalho! 💕
          </p>
          
          {/* Copyright */}
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Achados & Ofertas
          </p>
        </div>
      </div>
    </footer>
  );
}

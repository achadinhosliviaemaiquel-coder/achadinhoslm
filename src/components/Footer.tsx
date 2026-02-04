import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="bg-white border-t border-gray-200 mt-auto">
      <div className="container mx-auto max-w-md px-4 py-6">
        <div className="text-center space-y-4">
          {/* Logo */}
          <Link to="/" className="inline-flex items-center gap-2">
            <span className="text-xl">🛍️</span>
            <span className="font-semibold text-gray-800">Achados & Ofertas</span>
          </Link>

          {/* Disclaimer */}
          <p className="text-xs text-gray-500 leading-relaxed">
            Este site contém links de afiliados. Ao clicar e comprar,
            podemos receber uma pequena comissão sem custo adicional para você.
            Obrigado por apoiar nosso trabalho!
          </p>

          {/* Copyright */}
          <p className="text-xs text-gray-400">
            © {new Date().getFullYear()} Achados & Ofertas
          </p>
        </div>
      </div>
    </footer>
  );
}

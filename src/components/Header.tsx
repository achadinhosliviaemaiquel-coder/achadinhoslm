import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, User, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useRef, useEffect } from "react";
import { CATEGORY_LABELS, type ProductCategory } from "@/types/product";

const CATEGORIES = (Object.keys(CATEGORY_LABELS) as ProductCategory[]).sort(
  (a, b) => CATEGORY_LABELS[a].localeCompare(CATEGORY_LABELS[b])
);

export function Header() {
  const [term, setTerm] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    navigate(`/search?q=${encodeURIComponent(term)}`);
    setTerm("");
  };

  const isReviews = location.pathname === "/reviews";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-50 bg-background/95 border-b border-border backdrop-blur-sm">
      <div className="w-full max-w-[1000px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-3 sm:gap-6">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🏷️</span>
          <span className="font-bold text-lg text-foreground whitespace-nowrap hidden sm:inline">
            Saiu Promoção
          </span>
        </Link>

        {/* Categorias dropdown */}
        <div className="relative shrink-0" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen((v) => !v)}
            className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Categorias
            <ChevronDown className={`h-4 w-4 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute left-0 top-full mt-2 w-52 bg-background border border-border rounded-xl shadow-lg z-50 py-2 max-h-[70vh] overflow-y-auto">
              {CATEGORIES.map((category) => (
                <Link
                  key={category}
                  to={`/category/${category}`}
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  {CATEGORY_LABELS[category]}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Reviews */}
        <Link
          to="/reviews"
          className={`flex items-center gap-1.5 text-sm font-medium shrink-0 transition-colors ${
            isReviews ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Reviews
        </Link>

        {/* Search desktop */}
        <form onSubmit={handleSearch} className="flex-1 max-w-[240px] relative hidden sm:block">
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar produtos..."
            className="w-full h-9 pl-9 pr-3 rounded-full bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </form>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="rounded-full sm:hidden" onClick={() => navigate("/search")}>
            <Search className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" className="rounded-full" asChild>
            <Link to="/admin">
              <User className="h-5 w-5" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

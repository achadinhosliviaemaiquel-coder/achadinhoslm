import { Link, useNavigate, useLocation } from "react-router-dom";
import { Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function Header() {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;
    navigate(`/search?q=${encodeURIComponent(term)}`);
    setTerm("");
  };

  const isReviews = location.pathname === "/reviews";

  return (
    <header className="sticky top-0 z-50 bg-background/95 border-b border-border backdrop-blur-sm">
      <div className="container max-w-mobile mx-auto px-4 h-14 flex items-center justify-between gap-2">
        {/* 🛍️ Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🛍️</span>
          <span className="font-bold text-lg text-foreground whitespace-nowrap hidden sm:inline">
            Achadinhos LM
          </span>
        </Link>

        {/* Q59: Link Reviews com badge "novo" */}
        <Link
          to="/reviews"
          className={`flex items-center gap-1.5 text-sm font-medium shrink-0 transition-colors ${
            isReviews
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Reviews
          <span className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
            novo
          </span>
        </Link>

        {/* 🔍 Search Bar (DESKTOP) */}
        <form
          onSubmit={handleSearch}
          className="flex-1 max-w-[240px] relative hidden sm:block"
        >
          <input
            type="text"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Buscar produtos..."
            className="w-full h-9 pl-9 pr-3 rounded-full bg-muted text-sm outline-none focus:ring-2 focus:ring-primary/40"
          />
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        </form>

        {/* 👤 Actions */}
        <div className="flex items-center gap-1">
          {/* 🔍 Mobile search */}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full sm:hidden"
            onClick={() => navigate("/search")}
          >
            <Search className="h-5 w-5" />
          </Button>

          {/* 👤 Admin */}
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

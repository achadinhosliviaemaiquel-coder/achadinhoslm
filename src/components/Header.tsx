import { Link, useNavigate } from "react-router-dom";
import { Search, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export function Header() {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!term.trim()) return;

    navigate(`/search?q=${encodeURIComponent(term)}`);
    setTerm("");
  };

  return (
    <header className="sticky top-0 z-50 bg-background/95 border-b border-border">
      <div className="container max-w-mobile mx-auto px-4 h-14 flex items-center justify-between gap-2">

        {/* 🛍️ Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <span className="text-2xl">🛍️</span>
          <span className="font-bold text-lg text-foreground whitespace-nowrap">
            Achadinhos LM
          </span>
        </Link>

        {/* 📝 Reviews link */}
        <Link
          to="/reviews"
          className="text-sm font-medium text-foreground/80 hover:text-foreground transition shrink-0 flex items-center"
        >
          Reviews
          <span className="hidden sm:inline bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded-full ml-1 leading-none">
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

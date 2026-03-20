import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSupabase } from "@/integrations/supabase/client";
const supabase = getSupabase();
import { Layout } from "@/components/Layout";
import { Loader2, AlertCircle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

type StoreOffer = {
  id: number;
  url: string;
  is_active: boolean;
  current_price_cents: number | null;
  platform: string;
  product_id: string;
};

// Gera um session_id único por sessão do browser
function getSessionId(): string {
  let sid = sessionStorage.getItem("_asid");
  if (!sid) {
    sid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem("_asid", sid);
  }
  return sid;
}

export default function BridgePage() {
  const { store, slug } = useParams<{ store: string; slug: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [offerUrl, setOfferUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!store || !slug) {
      navigate("/", { replace: true });
      return;
    }

    let cancelled = false;

    const run = async () => {
      try {
        // Buscar produto pelo slug
        const { data: product, error: pErr } = await supabase
          .from("products")
          .select("id, name")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (pErr || !product) {
          setError("Produto não encontrado ou indisponível.");
          setLoading(false);
          return;
        }

        // Buscar offer ativa para a loja
        const { data: offer, error: oErr } = await supabase
          .from("store_offers")
          .select("id, url, is_active, current_price_cents, platform, product_id")
          .eq("product_id", product.id)
          .eq("platform", store.toLowerCase())
          .eq("is_active", true)
          .maybeSingle();

        if (oErr || !offer || !offer.is_active) {
          setError("Oferta indisponível para esta loja no momento.");
          setLoading(false);
          return;
        }

        if (cancelled) return;

        setOfferUrl(offer.url);

        // Q21: Registrar outbound ANTES de redirecionar
        const params = new URLSearchParams(window.location.search);
        const sessionId = getSessionId();

        await supabase.from("product_outbounds").insert({
          product_id: product.id,
          store: store.toLowerCase(),
          offer_id: offer.id,
          price_at_click: offer.current_price_cents
            ? offer.current_price_cents / 100
            : null,
          currency_at_click: "BRL",
          referer: document.referrer || null,
          user_agent: navigator.userAgent,
          session_id: sessionId,
          utm_source: params.get("utm_source"),
          utm_medium: params.get("utm_medium"),
          utm_campaign: params.get("utm_campaign"),
          utm_content: params.get("utm_content"),
          utm_term: params.get("utm_term"),
          fbclid: params.get("fbclid"),
          gclid: params.get("gclid"),
          ttclid: params.get("ttclid"),
          page_url: window.location.href,
          traffic: document.referrer ? "organic" : "direct",
        });

        if (!cancelled) {
          window.location.href = offer.url;
        }
      } catch (err) {
        console.error("BridgePage error:", err);
        setError("Erro ao redirecionar. Tente novamente.");
        setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; };
  }, [store, slug, navigate]);

  if (error) {
    return (
      <Layout seo={{ title: "Redirecionando... | Achadinhos LM", noindex: true }}>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
          <AlertCircle className="h-12 w-12 text-muted-foreground" />
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">Oferta indisponível</h1>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => navigate(-1)}>
              Voltar
            </Button>
            <Button onClick={() => navigate("/")}>
              Ver outros produtos
            </Button>
          </div>
          {offerUrl && (
            <a
              href={offerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-primary underline underline-offset-4"
            >
              Acessar oferta diretamente <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout seo={{ title: "Redirecionando... | Achadinhos LM", noindex: true }}>
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground text-sm">
          Redirecionando para a oferta...
        </p>
        {offerUrl && (
          <a
            href={offerUrl}
            className="text-xs text-muted-foreground underline underline-offset-4 mt-2"
          >
            Clique aqui se não for redirecionado automaticamente
          </a>
        )}
      </div>
    </Layout>
  );
}

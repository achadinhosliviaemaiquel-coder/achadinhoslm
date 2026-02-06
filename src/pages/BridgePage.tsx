import { useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useProduct } from '@/hooks/useProducts';
import {
  detectBrowser,
  generateClickId,
  storeClickId,
  appendClickId,
  preserveUtmParams
} from '@/lib/browser-detection';
import { trackBridgeLoaded, trackOutboundClick } from '@/lib/analytics';
import { Loader2, ExternalLink } from 'lucide-react';
import { getSupabase } from '@/integrations/supabase/client';

type Store = 'shopee' | 'mercadolivre' | 'amazon';

const STORE_LABELS: Record<Store, string> = {
  shopee: 'Shopee',
  mercadolivre: 'Mercado Livre',
  amazon: 'Amazon',
};

const REDIRECT_DELAY = 1400; // 1.4 seconds

function parsePriceLabelToCents(label?: string | null) {
  if (!label) return null;
  const value = label.replace(/[^\d,]/g, "").replace(",", ".");
  const num = parseFloat(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

function getUtm() {
  const sp = new URLSearchParams(window.location.search);
  return {
    utm_source: sp.get('utm_source'),
    utm_medium: sp.get('utm_medium'),
    utm_campaign: sp.get('utm_campaign'),
  };
}

export default function BridgePage() {
  const { store, slug } = useParams<{ store: string; slug: string }>();
  const { data: product, isLoading } = useProduct(slug || '');
  const [countdown, setCountdown] = useState(REDIRECT_DELAY / 1000);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [hasRedirected, setHasRedirected] = useState(false);

  const validStore = store as Store;
  const storeLabel = STORE_LABELS[validStore] || store;

  // ✅ garante que usamos o mesmo clickId em auto e manual
  const clickIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!product || hasRedirected) return;

    // valida store
    if (!['shopee', 'mercadolivre', 'amazon'].includes(validStore)) return;

    const linkKey = `${validStore}_link` as keyof typeof product;
    const affiliateUrl = product[linkKey] as string | null;
    if (!affiliateUrl) return;

    // Detect browser e clickId
    detectBrowser(); // mantém seu fluxo (mesmo se não usar retorno aqui)

    if (!clickIdRef.current) {
      clickIdRef.current = generateClickId();
    }
    const clickId = clickIdRef.current;

    // Store click info local
    storeClickId(clickId, product.slug, validStore);

    // Track bridge load
    trackBridgeLoaded(validStore, product.slug);

    // Build final URL (clickId + utms)
    let finalUrl = appendClickId(affiliateUrl, clickId);
    finalUrl = preserveUtmParams(finalUrl);
    setRedirectUrl(finalUrl);

    // ✅ registra OUTBOUND no Supabase durante a espera (1.4s)
    // Como estamos aguardando, a chance de completar antes do redirect é alta.
    (async () => {
      try {
        const supabase = getSupabase();
        const utm = getUtm();

        await supabase.from('product_clicks').insert({
          product_id: product.id,
          store: validStore,
          kind: 'outbound',
          click_id: clickId,
          price_cents: parsePriceLabelToCents(product.price_label),
          user_agent: navigator.userAgent,
          referrer: document.referrer || null,
          ...utm,
        });
      } catch {
        // não quebra
      }
    })();

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 0.1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);

    // Delayed redirect
    const redirectTimeout = setTimeout(() => {
      trackOutboundClick(validStore, product.slug, clickId);
      setHasRedirected(true);
      window.location.href = finalUrl;
    }, REDIRECT_DELAY);

    return () => {
      clearInterval(countdownInterval);
      clearTimeout(redirectTimeout);
    };
  }, [product, validStore, hasRedirected]);

  const handleManualRedirect = async () => {
    if (!redirectUrl || hasRedirected || !product) return;

    const clickId = clickIdRef.current || generateClickId();
    clickIdRef.current = clickId;

    // registra no GA com o MESMO clickId
    trackOutboundClick(validStore, product.slug, clickId);

    // tenta registrar no Supabase antes de sair (manual)
    try {
      const supabase = getSupabase();
      const utm = getUtm();

      await supabase.from('product_clicks').insert({
        product_id: product.id,
        store: validStore,
        kind: 'outbound',
        click_id: clickId,
        price_cents: parsePriceLabelToCents(product.price_label),
        user_agent: navigator.userAgent,
        referrer: document.referrer || null,
        ...utm,
      });
    } catch {
      // ignore
    }

    setHasRedirected(true);
    window.location.href = redirectUrl;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <span className="text-4xl">😢</span>
          <h1 className="text-xl font-semibold text-foreground">Produto não encontrado</h1>
          <Button asChild>
            <Link to="/">Voltar ao início</Link>
          </Button>
        </div>
      </div>
    );
  }

  const linkKey = `${validStore}_link` as keyof typeof product;
  const hasLink = !!product[linkKey];

  if (!hasLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <span className="text-4xl">🚫</span>
          <h1 className="text-xl font-semibold text-foreground">Link indisponível</h1>
          <p className="text-muted-foreground">
            Este produto não está disponível na {storeLabel}.
          </p>
          <Button asChild>
            <Link to={`/product/${product.slug}`}>Ver outras opções</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-sm w-full text-center space-y-6 animate-fade-in">
        <div className="space-y-2">
          <span className="text-4xl">🛍️</span>
          <h1 className="text-lg font-semibold text-foreground">
            Redirecionando para {storeLabel}
          </h1>
        </div>

        <div className="bg-card rounded-2xl p-4 shadow-card space-y-3">
          <div className="w-24 h-24 mx-auto rounded-xl overflow-hidden bg-muted">
            <img
              src={product.image_urls?.[0] || '/placeholder.svg'}
              alt={product.name}
              className="w-full h-full object-cover"
            />
          </div>
          <p className="font-medium text-foreground line-clamp-2">{product.name}</p>
          <p className="text-primary font-bold">{product.price_label}</p>
        </div>

        <div className="space-y-3">
          <div className="relative h-1 bg-muted rounded-full overflow-hidden">
            <div
              className="absolute left-0 top-0 h-full bg-primary transition-all duration-100 ease-linear"
              style={{
                width: `${((REDIRECT_DELAY / 1000 - countdown) / (REDIRECT_DELAY / 1000)) * 100}%`,
              }}
            />
          </div>
          <p className="text-sm text-muted-foreground">Aguarde... {countdown.toFixed(1)}s</p>
        </div>

        <Button
          onClick={handleManualRedirect}
          variant="outline"
          size="lg"
          className="w-full"
          disabled={!redirectUrl}
        >
          Se não redirecionar, toque aqui
          <ExternalLink className="ml-2 h-4 w-4" />
        </Button>

        <Link
          to={`/product/${product.slug}`}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Voltar ao produto
        </Link>
      </div>
    </div>
  );
}

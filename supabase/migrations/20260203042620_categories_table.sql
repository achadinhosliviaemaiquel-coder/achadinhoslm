-- ======================================
-- CATEGORIES TABLE (new model)
-- ======================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index para SEO lookup
CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);

INSERT INTO public.categories (slug, name)
SELECT DISTINCT
    category::text AS slug,
    INITCAP(category::text) AS name
FROM public.products
ON CONFLICT (slug) DO NOTHING;

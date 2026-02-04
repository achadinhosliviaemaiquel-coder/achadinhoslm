-- ======================================
-- 1. CREATE CATEGORIES TABLE
-- ======================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);


-- ======================================
-- 2. ADD category_id COLUMN
-- ======================================

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS category_id UUID;


-- ======================================
-- 3. POPULATE categories FROM ENUM
-- ======================================

INSERT INTO public.categories (slug, name)
SELECT DISTINCT
    category::text AS slug,
    INITCAP(category::text) AS name
FROM public.products
ON CONFLICT (slug) DO NOTHING;


-- ======================================
-- 4. LINK PRODUCTS → CATEGORIES
-- ======================================

UPDATE public.products p
SET category_id = c.id
FROM public.categories c
WHERE p.category::text = c.slug
AND p.category_id IS NULL;


-- ======================================
-- 5. ADD FK CONSTRAINT (after data exists)
-- ======================================

DO $$ BEGIN
    ALTER TABLE public.products
    ADD CONSTRAINT products_category_id_fkey
    FOREIGN KEY (category_id)
    REFERENCES public.categories(id);
EXCEPTION WHEN duplicate_object THEN null;
END $$;


-- ======================================
-- 6. ENFORCE NOT NULL
-- ======================================

ALTER TABLE public.products
ALTER COLUMN category_id SET NOT NULL;

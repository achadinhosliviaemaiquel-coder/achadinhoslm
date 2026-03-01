-- Migration: adiciona campo de override de preço manual em store_offers
-- Quando price_override_brl está definido, o cron usa este valor e não chama a API externa.

ALTER TABLE public.store_offers
  ADD COLUMN IF NOT EXISTS price_override_brl NUMERIC(12,2) NULL;

COMMENT ON COLUMN public.store_offers.price_override_brl IS
  'Preço manual em BRL que substitui o valor buscado pelo cron. Se definido, o cron usa este valor e não chama a API externa.';

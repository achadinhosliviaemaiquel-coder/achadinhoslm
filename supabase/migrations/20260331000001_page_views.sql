-- Tabela leve para rastrear page views do site
CREATE TABLE IF NOT EXISTS page_views (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  path      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice para queries por data (today, 7d, 14d, 30d)
CREATE INDEX IF NOT EXISTS page_views_created_at_idx ON page_views (created_at DESC);

-- RLS: apenas service_role pode inserir/ler
ALTER TABLE page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON page_views
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

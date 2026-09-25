-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path: tempo estimado de cada etapa.
--
-- A trilha mostrava só título e estado. Com o tempo estimado, o professor
-- sabe quanto falta antes de abrir uma etapa ("cerca de 20 min") e quanto
-- falta da trilha toda. Quem define é a coordenação, na aba Conteúdo; vazio
-- = não mostra.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.welcome_path_etapas
  ADD COLUMN IF NOT EXISTS minutos_estimados smallint
  CHECK (minutos_estimados IS NULL OR minutos_estimados BETWEEN 1 AND 600);

COMMENT ON COLUMN public.welcome_path_etapas.minutos_estimados IS
  'Tempo estimado da etapa, em minutos (leitura + vídeos + atividades). Vazio = não mostra.';

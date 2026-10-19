-- ─────────────────────────────────────────────────────────────────────────────
-- Documentos da trilha para baixar (2026-10-19): o MAPA em PDF.
--
-- Bucket PRIVADO e sem policy: anon e authenticated não leem nada. Só a
-- portal-welcome-path (service_role) gera link assinado, e só para quem tem
-- sessão do portal (código no e-mail). O repositório é público, então o PDF
-- também não entra no git nem em public/.
--
-- O arquivo sobe por fora (CLI), sempre no mesmo caminho: mapa/MAPA.pdf.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('welcome-path-docs', 'welcome-path-docs', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

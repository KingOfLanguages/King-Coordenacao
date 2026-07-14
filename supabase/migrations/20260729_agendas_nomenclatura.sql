-- ─────────────────────────────────────────────────────────────────────────────
-- Fase C: nomenclatura — "Reunião de Feedback" → "Reunião em Grupo"
--
-- O título das agendas é gerado automaticamente a partir do coordenador
-- (tituloAgenda no front). Renomeia só as que ainda batem o padrão automático
-- ANTIGO — títulos customizados à mão não são tocados.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE agenda_reunioes
SET titulo = REPLACE(titulo, 'Reunião de Feedback — Coord.', 'Reunião em Grupo — Coord.')
WHERE titulo LIKE 'Reunião de Feedback — Coord.%';

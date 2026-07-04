-- ─────────────────────────────────────────────────────────────────────────────
-- Reunião interna (equipe de coordenação / liderança, sem professor) — daily
-- import passa a capturar também esses eventos (hoje descartados pelo
-- BLOCKLIST de ruído: daily, standup, sync, treinamento…) quando há pelo
-- menos um participante conhecido da King (profiles.google_email) e nenhum
-- participante externo. Reaproveita reunioes.status (enum status_reuniao:
-- pendente/concluida/cancelada) e reunioes.notas pra confirmação — mesmo
-- padrão de reuniao_professores, só que a nível de reunião (não tem professor
-- pra vincular o registro).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reunioes
  ADD COLUMN IF NOT EXISTS tipo_reuniao TEXT NOT NULL DEFAULT 'professor'
    CHECK (tipo_reuniao IN ('professor', 'interna')),
  ADD COLUMN IF NOT EXISTS pauta TEXT,
  ADD COLUMN IF NOT EXISTS participantes_emails TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_reunioes_tipo_reuniao ON reunioes (tipo_reuniao, data);

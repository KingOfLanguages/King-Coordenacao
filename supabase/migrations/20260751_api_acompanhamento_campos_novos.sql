-- ─────────────────────────────────────────────────────────────────────────────
-- API de Acompanhamento — campos novos (guia da King 2026-07-31), Fase 1.
--
-- A API passou a expor, na MESMA rota /api/v1/acompanhamento-professores:
--   • perfil { email, telefone, cidade, estado, nivel_recomendado_alunos,
--              dados_atualizados }  → contato/perfil do professor (antes só planilha)
--   • roster ganhou status_vinculo_codigo, status_aluno, tipo_vinculo,
--              data_matricula_escola
--   • agenda_bloqueada + motivos_bloqueio (professor fora de operação)
--
-- Esta migration só ABRE espaço no schema. Quem preenche é o kms-api-sync:
--   - contato (telefone/email/cidade/estado) por COALESCE — SÓ onde está vazio,
--     nunca sobrescreve a curadoria manual/planilha;
--   - dados_atualizados e nivel_recomendado_alunos_raw são espelho da API
--     (sobrescritos a cada sync). O nivel curado (nivel_recomendado_alunos)
--     NÃO é tocado — os valores da API ("Avancado"…) não batem com os nossos
--     ('B1 ou mais'/'A1 ou A2'/'Sem prioridade') e o mapeamento fica pra depois.
--
-- ORDEM DE DEPLOY: aplicar esta migration ANTES de subir o kms-api-sync novo
-- (o sync passa a gravar as colunas abaixo; sem elas o upsert quebra).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Perfil do professor (espelho da API) ─────────────────────────────────────
ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS dados_atualizados            BOOLEAN,
  ADD COLUMN IF NOT EXISTS nivel_recomendado_alunos_raw TEXT;

COMMENT ON COLUMN professores.dados_atualizados IS
  'Flag da API: o próprio professor confirmou os dados cadastrais. Use pra decidir disparo confiável de e-mail/WhatsApp. Espelho da API (sobrescrito a cada sync).';
COMMENT ON COLUMN professores.nivel_recomendado_alunos_raw IS
  'nivel_recomendado_alunos como vem da API (valores diferentes do nivel curado). Mapear antes de usar; nivel_recomendado_alunos (curado) não é tocado pelo sync.';

-- ── Roster de alunos — campos novos ──────────────────────────────────────────
ALTER TABLE professor_alunos_kms
  ADD COLUMN IF NOT EXISTS status_vinculo_codigo TEXT,
  ADD COLUMN IF NOT EXISTS status_aluno          TEXT,
  ADD COLUMN IF NOT EXISTS tipo_vinculo          TEXT,
  ADD COLUMN IF NOT EXISTS data_matricula_escola DATE;

COMMENT ON COLUMN professor_alunos_kms.status_vinculo_codigo IS 'Código sem acento do vínculo (vinculo_efetivado | aguardando_assinatura_contrato). Usar este no lugar de status_vinculo.';
COMMENT ON COLUMN professor_alunos_kms.status_aluno          IS 'ativo | pausado | saiu | desconhecido. Só ativo/pausado chegam no roster; saídas vão pro ciclo de vida.';
COMMENT ON COLUMN professor_alunos_kms.tipo_vinculo          IS 'aluno | turma. O sync já grava só tipo_vinculo=aluno (turmas, aluno_id 0, ficam de fora da carteira).';
COMMENT ON COLUMN professor_alunos_kms.data_matricula_escola IS 'Fechamento do contrato com a escola (≠ data_adicao, que é a entrada neste professor).';

-- ── Agenda bloqueada (professor fora de operação) ────────────────────────────
ALTER TABLE professor_acompanhamento
  ADD COLUMN IF NOT EXISTS agenda_bloqueada BOOLEAN,
  ADD COLUMN IF NOT EXISTS motivos_bloqueio JSONB;

COMMENT ON COLUMN professor_acompanhamento.agenda_bloqueada IS 'API: true SÓ quando o professor tem horários e TODOS estão bloqueados (fora de operação). Bloqueio parcial: ver agendas_bloqueadas.quantidade_horarios.';
COMMENT ON COLUMN professor_acompanhamento.motivos_bloqueio IS 'Lista [{motivo, quantidade}] da API.';

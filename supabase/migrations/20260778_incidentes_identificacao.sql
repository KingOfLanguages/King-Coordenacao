-- ─────────────────────────────────────────────────────────────────────────────
-- Incidentes: identificação (ID de professor/aluno) e relato estruturado.
--
-- Motivo: quem lê o incidente depois — principalmente o TI, nos bugs da
-- plataforma King — precisava adivinhar de QUEM se tratava. O professor já
-- vinha por professor_id (e o ID do King sai de professores.kms_id por join,
-- por isso não há coluna nova aqui), mas o aluno era só um primeiro nome em
-- texto livre (ver 20260704) — homônimo, sem chave, impossível de abrir no
-- King. E o "quando" registrado era só created_at, a hora do REGISTRO, que
-- pode ser dias depois do fato.
--
-- aluno_id:    ID do aluno no King (professor_alunos_kms.aluno_id). Snapshot,
--              não FK: o roster é DELETE+INSERT a cada rodada do kms-api-sync,
--              então uma referência real apagaria/quebraria o incidente quando
--              o aluno saísse do professor. É justamente aí que o ID importa.
-- ocorrido_em: quando o problema aconteceu (≠ created_at, quando foi
--              registrado). NULL nas linhas antigas — a UI cai no created_at.
-- passos:      como aconteceu, passo a passo. Separado de description (que é
--              "o que exatamente é o problema") para o relato de bug chegar
--              reproduzível ao TI em vez de virar um parágrafo só.
--
-- Colunas nullable e aditivas: o nexus-sync (upsert por colunas conhecidas)
-- segue funcionando e nenhuma policy muda — os fluxos de escrita já existentes
-- passam pela mesma RLS de nexus_incidents, só gravam mais três colunas.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents
  ADD COLUMN IF NOT EXISTS aluno_id    BIGINT,
  ADD COLUMN IF NOT EXISTS ocorrido_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS passos      TEXT;

COMMENT ON COLUMN nexus_incidents.aluno_id    IS 'ID do aluno no King (professor_alunos_kms.aluno_id). Snapshot sem FK — o roster é reescrito a cada sync.';
COMMENT ON COLUMN nexus_incidents.ocorrido_em IS 'Quando o problema aconteceu. Diferente de created_at (quando foi registrado). NULL = não informado (linhas antigas).';
COMMENT ON COLUMN nexus_incidents.passos      IS 'Como aconteceu, passo a passo. description continua sendo "o que exatamente é o problema".';

-- Índice parcial: serve pra juntar todos os incidentes de um mesmo aluno
-- (hoje o agrupamento de /alunos é por nome, ver useAcompanhamentoAlunos.ts).
CREATE INDEX IF NOT EXISTS idx_nexus_incidents_aluno
  ON nexus_incidents(aluno_id) WHERE aluno_id IS NOT NULL;

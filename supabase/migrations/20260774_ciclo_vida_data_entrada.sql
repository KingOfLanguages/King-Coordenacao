-- ─────────────────────────────────────────────────────────────────────────────
-- Permanência do aluno COM O PROFESSOR — a data que faltava.
--
-- PROBLEMA: para responder "quanto tempo um aluno fica com este professor" são
-- precisas as duas pontas. A saída já temos (professor_ciclo_vida_alunos.
-- data_saida). A entrada NESTE professor só existe no roster
-- (professor_alunos_kms.data_adicao) — e o roster é DELETE+INSERT a cada rodada
-- do kms-api-sync: no instante em que o aluno sai, a linha some e a data de
-- entrada vai junto.
--
-- O que sobra na tabela de saídas é `data_inicio_aulas` (primeira aula do aluno
-- NA ESCOLA). Para quem nunca trocou de professor os dois valores coincidem;
-- para quem trocou, a primeira aula é anterior à entrada neste professor e
-- INFLA a permanência. Serve de aproximação, não de número oficial.
--
-- SOLUÇÃO: coluna própria, preenchida pelo sync a partir do roster ANTES do
-- delete da rodada (ver kms-api-sync, passo 4/5). A partir daqui a permanência
-- de cada saída nova é exata; as saídas antigas seguem com a aproximação e a
-- UI diz qual é qual.
--
-- A coluna é PROTEGIDA por gatilho: o upsert do sync repete a mesma saída em
-- toda rodada em que ela ainda cabe na janela da API, e nas rodadas seguintes
-- o roster já não tem o aluno — sem a proteção, o segundo upsert sobrescreveria
-- a data boa com NULL.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professor_ciclo_vida_alunos
  ADD COLUMN IF NOT EXISTS data_entrada_professor DATE;

COMMENT ON COLUMN professor_ciclo_vida_alunos.data_entrada_professor IS
  'Entrada do aluno NESTE professor (professor_alunos_kms.data_adicao capturado antes do delete do sync). NULL em saídas anteriores a 2026-08-28 — nesses casos a UI aproxima por data_inicio_aulas. Nunca é sobrescrita por NULL (trg_preservar_data_entrada_professor).';

-- Nunca deixa um upsert posterior apagar a data já capturada.
CREATE OR REPLACE FUNCTION public.preservar_data_entrada_professor()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.data_entrada_professor :=
    COALESCE(NEW.data_entrada_professor, OLD.data_entrada_professor);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_preservar_data_entrada_professor ON professor_ciclo_vida_alunos;
CREATE TRIGGER trg_preservar_data_entrada_professor
  BEFORE UPDATE ON professor_ciclo_vida_alunos
  FOR EACH ROW EXECUTE FUNCTION public.preservar_data_entrada_professor();

-- Backfill possível: aluno que saiu e ainda está no roster do MESMO professor
-- (saiu e voltou, ou saída registrada sem o vínculo ter caído). É pouca coisa,
-- mas é dado exato — e sai de graça.
UPDATE professor_ciclo_vida_alunos c
   SET data_entrada_professor = a.data_adicao
  FROM professor_alunos_kms a
 WHERE a.professor_id = c.professor_id
   AND a.aluno_id     = c.aluno_id
   AND a.data_adicao IS NOT NULL
   AND c.data_entrada_professor IS NULL
   AND a.data_adicao <= c.data_saida;

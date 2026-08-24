-- ─────────────────────────────────────────────────────────────────────────────
-- Entradas do ranking de professores (tela /confiabilidade do Comercial).
--
-- POR QUE UMA RPC: o ranking precisa ordenar TODOS os professores ativos (893
-- hoje) e a conta depende de professor_acompanhamento, que tem 1.996 linhas —
-- acima do teto de 1.000 do PostgREST. Montar isso no cliente devolveria um
-- ranking que PARECE certo e está truncado, que é a pior falha possível numa
-- tela cuja única função é ordenar. Aqui a agregação é feita em conjunto, e o
-- cliente recebe uma linha por professor.
--
-- O QUE ELA NÃO FAZ: pontuar. A régua vive em `src/lib/rankingProfessores.ts` e
-- é COMPARTILHADA com a extensão do Meet (aba Grupo). Reimplementar os pesos em
-- SQL criaria duas réguas que divergem no primeiro ajuste — e aí a extensão e a
-- web discordariam sobre o mesmo professor. Esta função devolve só os números
-- crus; quem pontua é o TypeScript, num lugar só.
--
-- SECURITY INVOKER (o padrão, deliberadamente NÃO definer): a migration 20260723
-- esconde por RLS as categorias coordenação-only ("Problemas graves de
-- professores" e os procedimentos internos) de quem não é coordenação. Com
-- DEFINER, o comercial receberia no ranking a CONTAGEM de incidentes que ele não
-- pode ver — vazamento por agregação. Como invoker, cada cargo ranqueia sobre o
-- que enxerga, que é exatamente o que a página de um professor só e a extensão
-- já fazem hoje. Consistência com o que existe, e nada vaza.
--
-- DESEMPATE (pedido do João, 2026-08-24): score do King satura — 259 professores
-- ativos cravam 1500 com zero incidente e sairiam em ordem ALFABÉTICA. Entram
-- então dois fatores de lastro, com peso 2 e 1: QUANTIDADE DE ALUNOS (quem
-- sustenta carteira grande está mais provado) e TEMPO DE CASA. `data_inicio` sai
-- daqui CRUA de propósito: quem decide o que é data plausível é a régua em TS,
-- que a extensão também usa — sanitizar aqui criaria duas definições de "tempo
-- de casa" (18 dos 891 ativos têm data no futuro ou ano 0001).
--
-- Fora da conta, igual em confiabilidade.ts e no background da extensão:
-- 'Bugs'/'Melhorias'/'Plataforma' (bug do sistema aberto SOBRE o professor — as
-- descrições são "erro ao autorizar pagamento", "edição break dando erro"; punir
-- o professor por isso é erro) e 'Mês de análise' (consequência, não causa).
-- Incidente `incident_mode='interno'` CONTA: são 44 No-Shows, 24 reclamações e
-- faltas lançadas pela coordenação — falha real, só registrada por dentro.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS ranking_professores_entradas(TIMESTAMPTZ);

CREATE FUNCTION ranking_professores_entradas(p_desde TIMESTAMPTZ)
RETURNS TABLE (
  professor_id        UUID,
  nome                TEXT,
  grupo_id            UUID,
  grupo_nome          TEXT,
  score               INTEGER,
  incidentes          INTEGER,
  incidentes_abertos  INTEGER,
  feedbacks_positivos INTEGER,
  feedbacks_negativos INTEGER,
  alunos              INTEGER,
  data_inicio         DATE
)
LANGUAGE sql
STABLE
AS $$
  WITH inc AS (
    SELECT
      ni.professor_id                                        AS pid,
      (count(*))::int                                        AS total,
      (count(*) FILTER (WHERE NOT ni.resolved))::int          AS abertos
    FROM nexus_incidents ni
    WHERE ni.created_at >= p_desde
      AND ni.professor_id IS NOT NULL
      AND ni.problem_type NOT IN ('Bugs', 'Melhorias', 'Plataforma', 'Mês de análise')
    GROUP BY ni.professor_id
  ),
  fb AS (
    SELECT
      o.professor_id                                                  AS pid,
      (count(*) FILTER (WHERE o.tipo = 'feedback_positivo'))::int      AS pos,
      (count(*) FILTER (WHERE o.tipo = 'feedback_negativo'))::int      AS neg
    FROM observacoes o
    WHERE o.created_at >= p_desde
      AND o.professor_id IS NOT NULL
      AND o.tipo IN ('feedback_positivo', 'feedback_negativo')
    GROUP BY o.professor_id
  ),
  al AS (
    -- Carteira de hoje. O roster é reescrito a cada sync (DELETE+INSERT), então
    -- isto é sempre a foto atual — 'pausado'/'saiu' não somam carteira ativa.
    SELECT pak.professor_id AS pid, (count(*))::int AS total
    FROM professor_alunos_kms pak
    WHERE pak.status_aluno = 'ativo'
    GROUP BY pak.professor_id
  )
  SELECT
    p.id,
    p.nome,
    p.grupo_id,
    g.nome,
    pa.score_atual,
    COALESCE(inc.total, 0),
    COALESCE(inc.abertos, 0),
    COALESCE(fb.pos, 0),
    COALESCE(fb.neg, 0),
    COALESCE(al.total, 0),
    p.data_inicio
  FROM professores p
  LEFT JOIN grupos g                    ON g.id = p.grupo_id
  LEFT JOIN professor_acompanhamento pa ON pa.professor_id = p.id
  LEFT JOIN inc                         ON inc.pid = p.id
  LEFT JOIN fb                          ON fb.pid  = p.id
  LEFT JOIN al                          ON al.pid  = p.id
  WHERE p.status = 'ativo'
  ORDER BY p.nome;
$$;

COMMENT ON FUNCTION ranking_professores_entradas(TIMESTAMPTZ) IS
  'Números crus por professor ativo pro ranking do Comercial (/confiabilidade). NÃO pontua: a régua é src/lib/rankingProfessores.ts, compartilhada com a extensão. SECURITY INVOKER de propósito — DEFINER vazaria contagem das categorias coordenação-only (20260723) por agregação.';

GRANT EXECUTE ON FUNCTION ranking_professores_entradas(TIMESTAMPTZ) TO authenticated;

-- Sustenta o filtro por janela dos dois CTEs.
CREATE INDEX IF NOT EXISTS idx_nexus_incidents_created_prof ON nexus_incidents (created_at, professor_id);
CREATE INDEX IF NOT EXISTS idx_observacoes_created_tipo     ON observacoes (created_at, tipo);
CREATE INDEX IF NOT EXISTS idx_professor_alunos_kms_prof     ON professor_alunos_kms (professor_id, status_aluno);

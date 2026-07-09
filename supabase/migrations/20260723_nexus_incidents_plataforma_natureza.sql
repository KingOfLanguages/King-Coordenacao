-- ─────────────────────────────────────────────────────────────────────────────
-- Reorganização de Incidentes: aba Plataforma, natureza Informe/Desafio e
-- categorias restritas à coordenação.
--
-- natureza:  'informe' | 'desafio' — TEXT livre (mesmo padrão de urgency/
--            problem_type, sem enum/CHECK). NULL em linhas existentes é
--            tratado como 'desafio' no app (useIncidentes.ts).
-- ti_status: 'chamado_aberto' | 'em_analise_ti' — só relevante pra categorias
--            da aba Plataforma (Bugs, Melhorias); estado adicional e paralelo
--            ao ciclo aberto/em_andamento/concluido já existente.
--
-- A aba Plataforma não ganha coluna própria — continua derivada de
-- problem_type (igual à distinção Professor/Geral, que é derivada de
-- professor_id), evitando um segundo campo que possa dessincronizar.
--
-- Categorias "somente coordenação" (procedimentos do suporte do aluno,
-- procedimentos de vendedores, problemas graves de professores) deixam de
-- ser visíveis por SELECT pra quem não é coordenação/admin — troca a policy
-- "USING (true)" criada em 20260708_nexus_sync_tables.sql por uma que
-- filtra essas 3 categorias.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE nexus_incidents
  ADD COLUMN IF NOT EXISTS natureza TEXT,
  ADD COLUMN IF NOT EXISTS ti_status TEXT;

DROP POLICY IF EXISTS "nexus_incidents_select" ON nexus_incidents;
CREATE POLICY "nexus_incidents_select" ON nexus_incidents FOR SELECT TO authenticated
  USING (
    problem_type NOT IN (
      'Problemas em procedimentos do suporte do aluno',
      'Problemas em procedimentos de vendedores',
      'Problemas graves de professores'
    )
    OR sou_admin()
    OR minha_role() = 'coordenacao'::role_usuario
  );

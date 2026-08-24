-- ─────────────────────────────────────────────────────────────────────────────
-- Permissões do cargo 'comercial' (criado em 20260767).
--
-- O comercial REGISTRA incidente e só isso: não assume, não resolve, não edita
-- e não exclui — o fluxo de resolução continua com coordenação/suporte. Por isso
-- ganha uma policy própria de INSERT em vez de entrar no array da policy
-- "nexus_incidents_write" (FOR ALL), que daria também UPDATE/DELETE.
-- Policies do mesmo comando se somam com OR, então esta convive com a de 20260716.
--
-- Leitura: nada a fazer. professores, professor_acompanhamento,
-- professor_score_historico, observacoes, grupos e nexus_incidents já têm SELECT
-- liberado pra qualquer autenticado — inclusive o filtro de categorias
-- coordenação-only de 20260723, que continua escondendo do comercial
-- "Problemas graves de professores" e os procedimentos internos.
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "nexus_incidents_insert_comercial" ON nexus_incidents;
CREATE POLICY "nexus_incidents_insert_comercial" ON nexus_incidents FOR INSERT TO authenticated
  WITH CHECK (minha_role() = 'comercial'::role_usuario);

COMMENT ON POLICY "nexus_incidents_insert_comercial" ON nexus_incidents IS
  'Cargo comercial registra incidente (tela /confiabilidade) mas não resolve nem edita.';

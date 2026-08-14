-- ─────────────────────────────────────────────────────────────────────────────
-- Suporte: paridade de edição com a coordenação (2026-08-07).
--
-- Pedido do João: "Permissão para o suporte — poder excluir e adicionar professor
-- no processo de onboarding inteiro; dar via de regra todas as permissões de
-- edição que os coordenadores têm."
--
-- O front já foi virado num ponto só: canEdit() passou a incluir 'suporte'
-- (src/lib/permissions.ts). Esta migration espelha isso na RLS, fechando os gaps
-- onde a escrita ainda era exclusiva de admin/coordenacao.
--
-- Estratégia: policies ADITIVAS. RLS é permissiva (OR entre policies), então em
-- vez de reescrever as regras de coord/admin (arriscado — algumas têm o padrão
-- antigo `(SELECT role FROM profiles ...)`), acrescento uma policy nova por
-- operação liberando o mesmo conjunto via os helpers canônicos sou_admin()/
-- minha_role() (SECURITY DEFINER, sem recursão — ver 20260630_fix_minha_role).
-- Idempotente: cada policy é DROP IF EXISTS + CREATE.
--
-- Decisões do João nesta rodada:
--   • "Tirar da pausa" (encerrar pausa): LIBERADO pro suporte (antes era regra
--     de negócio coord-only; ele optou por abrir) → pode_encerrar_pausa().
--   • Excluir o CADASTRO do professor (hard delete): SEGUE só admin. No onboarding,
--     "remover" só tira da lista de acompanhamento (onboarding_professores, que o
--     suporte já escreve) — não apaga o professor. Por isso NÃO mexo em
--     professores_delete_admin.
--
-- Fora de escopo de propósito: agenda_* (o suporte nem tem acesso à tela de
-- Agendas — page_permissions), grupos e page_permissions (config de admin).
-- ─────────────────────────────────────────────────────────────────────────────

-- Gate reutilizado: admin (via flag ou role) OU coordenação OU suporte.
-- Escrito inline em cada policy pra manter o padrão helper canônico.


-- ── 1. professores: criar + editar (NÃO excluir) ──────────────────────────────
-- Cobre "Novo professor" (o botão já aparecia pro suporte, mas o INSERT batia na
-- RLS) e toda a edição de cadastro/grupo/monitoramento. DELETE continua só admin.

DROP POLICY IF EXISTS "professores_insert_suporte" ON professores;
CREATE POLICY "professores_insert_suporte" ON professores FOR INSERT TO authenticated
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "professores_update_suporte" ON professores;
CREATE POLICY "professores_update_suporte" ON professores FOR UPDATE TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));


-- ── 2. professor_emails ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "prof_emails_write_suporte" ON professor_emails;
CREATE POLICY "prof_emails_write_suporte" ON professor_emails FOR ALL TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));


-- ── 3. reuniões: editar + excluir (INSERT já inclui suporte — 20260725) ───────

DROP POLICY IF EXISTS "reunioes_update_suporte" ON reunioes;
CREATE POLICY "reunioes_update_suporte" ON reunioes FOR UPDATE TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "reunioes_delete_suporte" ON reunioes;
CREATE POLICY "reunioes_delete_suporte" ON reunioes FOR DELETE TO authenticated
  USING (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));


-- ── 4. reuniao_professores (editar/remover participação de professor) ─────────

DROP POLICY IF EXISTS "reuniao_prof_write_suporte" ON reuniao_professores;
CREATE POLICY "reuniao_prof_write_suporte" ON reuniao_professores FOR ALL TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));


-- ── 5. observacoes: resolver/editar/excluir (INSERT já inclui suporte — 20260706) ─

DROP POLICY IF EXISTS "observacoes_update_suporte" ON observacoes;
CREATE POLICY "observacoes_update_suporte" ON observacoes FOR UPDATE TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "observacoes_delete_suporte" ON observacoes;
CREATE POLICY "observacoes_delete_suporte" ON observacoes FOR DELETE TO authenticated
  USING (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));


-- ── 6. Dados de acompanhamento vindos da API do King ──────────────────────────
-- professor_acompanhamento / score_historico / alunos_kms: a coordenação pode
-- escrever; paridade pro suporte. (A sincronização kms-api-sync roda como
-- service_role e ignora RLS — estas policies só ampliam, não restringem.)

DROP POLICY IF EXISTS "professor_acompanhamento_write_suporte" ON professor_acompanhamento;
CREATE POLICY "professor_acompanhamento_write_suporte" ON professor_acompanhamento FOR ALL TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "professor_score_historico_write_suporte" ON professor_score_historico;
CREATE POLICY "professor_score_historico_write_suporte" ON professor_score_historico FOR ALL TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));

DROP POLICY IF EXISTS "professor_alunos_kms_write_suporte" ON professor_alunos_kms;
CREATE POLICY "professor_alunos_kms_write_suporte" ON professor_alunos_kms FOR ALL TO authenticated
  USING      (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]))
  WITH CHECK (sou_admin() OR minha_role() = ANY (ARRAY['coordenacao','suporte']::role_usuario[]));


-- ── 7. Conteúdo da trilha (aba "Conteúdo" do Onboarding) ──────────────────────
-- canEdit agora mostra a aba pro suporte; o gate de escrita é pode_gerir_welcome_path().
-- Substitui a função incluindo 'suporte'. (Storage e RPCs de bloco usam esta mesma
-- função — ver 20260749 — então um único ponto libera tudo.)

CREATE OR REPLACE FUNCTION pode_gerir_welcome_path() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao', 'suporte')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;
GRANT EXECUTE ON FUNCTION pode_gerir_welcome_path() TO authenticated;


-- ── 8. Encerrar pausa ("Tirar da pausa") — LIBERADO pro suporte ───────────────
-- Decisão do João (2026-08-07): sobrescreve a regra coord-only de 20260738/20260748.
-- pode_gerir_pausa() (trabalhar a fila) já incluía suporte; agora encerrar também.

CREATE OR REPLACE FUNCTION pode_encerrar_pausa() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao', 'suporte')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;
GRANT EXECUTE ON FUNCTION pode_encerrar_pausa() TO authenticated;


-- ── 9. Silêncio/Pendências: registrar mensagem ────────────────────────────────
-- SilencioPage/Central de Pendências usam podeAgir = canEdit. O RPC gateava em
-- admin/coordenacao — inclui suporte. Corpo reproduzido de 20260730 (só o gate muda).

CREATE OR REPLACE FUNCTION registrar_mensagem_pendencia(
  p_professor_id UUID, p_estagio TEXT, p_texto TEXT
) RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'coordenacao', 'suporte') OR is_admin = true)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para registrar mensagem de pendência.';
  END IF;

  INSERT INTO silencio_mensagem_log (professor_id, estagio, texto, enviado_por)
  VALUES (p_professor_id, p_estagio, p_texto, auth.uid());

  UPDATE acompanhamento_silencio SET
    msg_resolucao         = CASE WHEN p_estagio = 'alerta'      THEN true  ELSE msg_resolucao END,
    msg_resolucao_em      = CASE WHEN p_estagio = 'alerta'      THEN NOW() ELSE msg_resolucao_em END,
    msg_saida_alunos      = CASE WHEN p_estagio = 'aviso_saida' THEN true  ELSE msg_saida_alunos END,
    msg_saida_alunos_em   = CASE WHEN p_estagio = 'aviso_saida' THEN NOW() ELSE msg_saida_alunos_em END,
    reuniao_solicitada    = CASE WHEN p_estagio = 'reuniao'     THEN true  ELSE reuniao_solicitada END,
    reuniao_solicitada_em = CASE WHEN p_estagio = 'reuniao'     THEN NOW() ELSE reuniao_solicitada_em END,
    atualizado_em         = NOW()
  WHERE professor_id = p_professor_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION registrar_mensagem_pendencia(UUID, TEXT, TEXT) TO authenticated;

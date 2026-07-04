-- ─────────────────────────────────────────────────────────────────────────────
-- Reestruturação de papéis: admin vira uma capacidade auxiliar (is_admin),
-- desacoplada do papel operacional. Novo flag is_lider dá a um coordenador
-- visão das agendas dos outros coordenadores (liderança de coordenação).
--
-- role continua coordenacao | suporte | suporte_aluno | admin (não removido,
-- só deixa de ser a identidade primária). sou_admin() aceita tanto
-- is_admin = true quanto o legado role = 'admin', então nenhuma conta
-- existente perde acesso.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_lider boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.sou_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_admin OR role = 'admin' FROM profiles WHERE id = auth.uid()), false)
$$;

CREATE OR REPLACE FUNCTION public.sou_lider()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_lider FROM profiles WHERE id = auth.uid()), false)
$$;

GRANT EXECUTE ON FUNCTION public.sou_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sou_lider() TO authenticated;

-- ── Backfill de contas existentes ──────────────────────────────────────────────

-- João Marcos Duarte: sai de role=admin, vira coordenador ativo + líder + admin técnico.
UPDATE profiles SET role = 'coordenacao', is_lider = true, is_admin = true
  WHERE id = 'be7df2d7-677a-4cfd-bcf2-c0069f66dd4d';

-- Contas admin de infra/teste (Admin genérico, Lucas Macedo, TI): mantém role='admin',
-- só ganha a flag pra consistência futura.
UPDATE profiles SET is_admin = true
  WHERE id IN (
    'a7c2aa59-aa92-46a4-abdd-2bf8984b1091', -- Admin
    '3bccebc8-9e82-47d1-8c10-9e30711d734f', -- Lucas Macedo
    'ac051b14-5fff-46b4-9b6b-474df5113225'  -- TI
  );

-- Igor Hebling Sallowicz (chefe de TI): continua coordenacao, ganha acesso admin total.
UPDATE profiles SET is_admin = true
  WHERE id = '50dde148-99d3-4448-aaa0-1e0367ea2ae9';

-- Conta genérica "Coordenação": descontinuada.
UPDATE profiles SET ativo = false
  WHERE id = '2c15574c-7824-4908-80d5-6785f89f2b1f';

-- ── Policies: troca de checagem direta de role='admin' por sou_admin() ─────────

DROP POLICY IF EXISTS "profiles: leitura própria ou admin" ON profiles;
CREATE POLICY "profiles: leitura própria ou admin" ON profiles FOR SELECT TO authenticated
  USING ((id = auth.uid()) OR sou_admin());

DROP POLICY IF EXISTS "profiles: edição própria ou admin" ON profiles;
CREATE POLICY "profiles: edição própria ou admin" ON profiles FOR UPDATE TO authenticated
  USING ((id = auth.uid()) OR sou_admin());

DROP POLICY IF EXISTS "Admins can select approvals" ON pending_approvals;
CREATE POLICY "Admins can select approvals" ON pending_approvals FOR SELECT TO authenticated
  USING (sou_admin());

DROP POLICY IF EXISTS "Admins can update approvals" ON pending_approvals;
CREATE POLICY "Admins can update approvals" ON pending_approvals FOR UPDATE TO authenticated
  USING (sou_admin());

DROP POLICY IF EXISTS "aprovacoes: apenas admin" ON pending_approvals;
CREATE POLICY "aprovacoes: apenas admin" ON pending_approvals FOR ALL TO authenticated
  USING (sou_admin());

DROP POLICY IF EXISTS "Admins can view any google token" ON google_tokens;
CREATE POLICY "Admins can view any google token" ON google_tokens FOR SELECT TO authenticated
  USING (sou_admin());

DROP POLICY IF EXISTS "Admins can delete any google token" ON google_tokens;
CREATE POLICY "Admins can delete any google token" ON google_tokens FOR DELETE TO authenticated
  USING (sou_admin());

DROP POLICY IF EXISTS "grupos_admin_write" ON grupos;
CREATE POLICY "grupos_admin_write" ON grupos FOR ALL TO authenticated
  USING (sou_admin()) WITH CHECK (sou_admin());

DROP POLICY IF EXISTS "professores_delete_admin" ON professores;
CREATE POLICY "professores_delete_admin" ON professores FOR DELETE TO authenticated
  USING (sou_admin());

DROP POLICY IF EXISTS "contatos_select" ON contatos_diarios;
CREATE POLICY "contatos_select" ON contatos_diarios FOR SELECT TO authenticated
  USING (coordenador_id = auth.uid() OR sou_admin());

DROP POLICY IF EXISTS "contatos_update" ON contatos_diarios;
CREATE POLICY "contatos_update" ON contatos_diarios FOR UPDATE TO authenticated
  USING (coordenador_id = auth.uid() OR sou_admin())
  WITH CHECK (coordenador_id = auth.uid() OR sou_admin());

DROP POLICY IF EXISTS "config: escrita admin" ON app_config;
CREATE POLICY "config: escrita admin" ON app_config FOR ALL TO authenticated
  USING (sou_admin());

-- ── Funções com checagem de role embutida no corpo ─────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT sou_admin() THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir usuários';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é possível excluir a própria conta';
  END IF;

  DELETE FROM public.profiles WHERE id = target_user_id;
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION distribuir_professores_inicial(p_force BOOLEAN DEFAULT false)
RETURNS TABLE(grupo_id UUID, nome TEXT, total BIGINT) AS $$
DECLARE
  v_grupos UUID[];
  v_n      INT;
  v_count  INT;
  r        RECORD;
  i        INT := 0;
BEGIN
  IF NOT sou_admin() THEN
    RAISE EXCEPTION 'Apenas administradores podem executar a distribuição inicial.';
  END IF;

  SELECT count(*) INTO v_count
    FROM professores WHERE status = 'ativo' AND grupo_id IS NOT NULL;
  IF v_count > 0 AND NOT p_force THEN
    RAISE EXCEPTION 'Já existem % professores distribuídos. Use force=true para redistribuir.', v_count;
  END IF;

  SELECT array_agg(g.id ORDER BY g.created_at) INTO v_grupos FROM grupos g WHERE g.ativo;
  v_n := COALESCE(array_length(v_grupos, 1), 0);
  IF v_n = 0 THEN
    RAISE EXCEPTION 'Nenhum grupo ativo cadastrado.';
  END IF;

  FOR r IN
    SELECT p.id,
      CASE
        WHEN p.data_inicio IS NULL                                         THEN 3
        WHEN p.data_inicio >= CURRENT_DATE - INTERVAL '3 months'           THEN 1  -- Faixa A
        WHEN p.data_inicio >= CURRENT_DATE - INTERVAL '8 months'           THEN 2  -- Faixa B
        ELSE                                                                    3  -- Faixa C
      END AS faixa
    FROM professores p
    WHERE p.status = 'ativo'
    ORDER BY faixa, p.data_inicio NULLS LAST, p.id
  LOOP
    UPDATE professores
       SET grupo_id       = v_grupos[(i % v_n) + 1],
           coordenador_id = COALESCE(
             coordenador_id,
             (SELECT g.coordenador_id FROM grupos g WHERE g.id = v_grupos[(i % v_n) + 1])
           )
     WHERE id = r.id;
    i := i + 1;
  END LOOP;

  RETURN QUERY
    SELECT g.id, g.nome,
           count(p.id) FILTER (WHERE p.status = 'ativo')
    FROM grupos g
    LEFT JOIN professores p ON p.grupo_id = g.id
    WHERE g.ativo
    GROUP BY g.id, g.nome
    ORDER BY g.created_at;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION distribuir_professores_inicial(boolean) TO authenticated;

CREATE OR REPLACE FUNCTION gerar_contatos_dia(p_coordenador_id UUID)
RETURNS SETOF contatos_diarios AS $$
DECLARE
  v_existe INT;
BEGIN
  IF auth.uid() <> p_coordenador_id AND NOT sou_admin() THEN
    RAISE EXCEPTION 'Sem permissão para gerar contatos deste coordenador.';
  END IF;

  SELECT count(*) INTO v_existe
    FROM contatos_diarios
   WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;

  IF v_existe = 0 THEN
    INSERT INTO contatos_diarios (coordenador_id, professor_id, data)
    SELECT p_coordenador_id, p.id, CURRENT_DATE
    FROM professores p
    WHERE p.status = 'ativo' AND p.coordenador_id = p_coordenador_id
    ORDER BY (
      SELECT max(cd.data) FROM contatos_diarios cd
       WHERE cd.professor_id = p.id AND cd.enviado
    ) ASC NULLS FIRST, p.nome ASC
    LIMIT 20
    ON CONFLICT (coordenador_id, professor_id, data) DO NOTHING;
  END IF;

  RETURN QUERY
    SELECT * FROM contatos_diarios
     WHERE coordenador_id = p_coordenador_id AND data = CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION gerar_contatos_dia(uuid) TO authenticated;

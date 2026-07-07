-- ─────────────────────────────────────────────────────────────────────────────
-- Login com Google: o OAuth do Google preenche raw_user_meta_data com
-- full_name / name (não a chave 'nome' que o cadastro por e-mail usa). Sem
-- isso, uma conta criada via Google cairia no fallback split_part(email,'@')
-- e apareceria em /admin/aprovacoes com o prefixo do e-mail em vez do nome
-- real. Amplia o COALESCE pra também ler full_name e name.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text := COALESCE(
    NEW.raw_user_meta_data->>'nome',
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
BEGIN
  INSERT INTO public.profiles (id, nome, role, ativo)
  VALUES (
    NEW.id,
    v_nome,
    'suporte',   -- role padrão; admin pode alterar na aprovação
    FALSE        -- bloqueado até aprovação explícita do admin
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pending_approvals (user_id, email, nome, role_solicitada)
  VALUES (
    NEW.id,
    NEW.email,
    v_nome,
    'suporte'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

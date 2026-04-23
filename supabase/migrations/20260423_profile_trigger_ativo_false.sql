-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: novos usuários criados com ativo = FALSE
-- O acesso só é liberado quando o admin aprova em /admin/aprovacoes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, role, ativo)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    'suporte',   -- role padrão; admin pode alterar na aprovação
    FALSE        -- bloqueado até aprovação explícita do admin
  )
  ON CONFLICT (id) DO NOTHING;   -- não sobrescreve perfis já existentes
  RETURN NEW;
END;
$$;

-- Recria o trigger (DROP + CREATE para garantir que use a versão atualizada)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

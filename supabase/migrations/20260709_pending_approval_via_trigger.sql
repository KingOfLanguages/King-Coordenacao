-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: pending_approvals nunca era criado no cadastro.
--
-- O insert em pending_approvals era feito pelo cliente (Cadastro.tsx) logo após
-- signUp(), contando com uma sessão ativa para satisfazer a RLS
-- (user_id = auth.uid()). Mas o projeto tem "Confirm email" habilitado no
-- Supabase Auth, então signUp() NÃO gera sessão até o usuário clicar no link
-- de confirmação — auth.uid() fica null no momento do insert, a RLS barra, e a
-- solicitação nunca aparece em /admin/aprovacoes.
--
-- Fix: mover a criação da solicitação para dentro do trigger handle_new_user
-- (SECURITY DEFINER, já usado para criar o profile), que roda no INSERT em
-- auth.users e não depende de sessão do cliente.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pending_approvals
  ADD CONSTRAINT pending_approvals_user_id_key UNIQUE (user_id);

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
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.pending_approvals (user_id, email, nome, role_solicitada)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    'suporte'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

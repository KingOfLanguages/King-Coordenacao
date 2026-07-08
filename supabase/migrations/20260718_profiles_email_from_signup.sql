-- ─────────────────────────────────────────────────────────────────────────────
-- E-mail de cadastro (login) vinculado direto ao profile.
--
-- Antes: pra atribuir reuniões a um coordenador, o admin tinha que digitar à mão
-- o google_email — que, na prática, quase sempre é o MESMO e-mail com que a
-- pessoa faz login (via Google). Agora o e-mail de cadastro (auth.users.email) é
-- espelhado em profiles.email e usado direto na atribuição. O google_email
-- continua existindo, mas só como e-mail ALTERNATIVO/EXTRA — pro caso raro em que
-- a agenda do Google usa um e-mail diferente do e-mail de login.
--
-- profiles.email NÃO é credencial de acesso: o login continua sendo resolvido
-- pelo UUID via Supabase Auth. É só um rótulo de identificação, igual ao
-- google_email. Ver [[ktm-google-shared-account]].
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

COMMENT ON COLUMN public.profiles.email IS
  'E-mail de cadastro/login (espelho de auth.users.email). Fonte primária de
   atribuição de reuniões. Não é credencial de acesso.';

-- ── Backfill: copia o e-mail de login de todos os usuários já existentes ───────
UPDATE public.profiles p
SET    email = u.email
FROM   auth.users u
WHERE  u.id = p.id
  AND  p.email IS DISTINCT FROM u.email;

-- ── Limpa google_email redundante ─────────────────────────────────────────────
-- Onde o google_email cadastrado à mão é idêntico ao e-mail de login, ele vira
-- ruído (a atribuição já vem de profiles.email). Zera pra que o campo
-- "e-mail alternativo" só mostre e-mails GENUINAMENTE diferentes.
UPDATE public.profiles
SET    google_email = NULL
WHERE  google_email IS NOT NULL
  AND  lower(google_email) = lower(email);

-- ── Trigger de criação: passa a gravar o e-mail de cadastro no profile ─────────
-- (Reescreve handle_new_user preservando a lógica de nome de 20260715.)
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
  INSERT INTO public.profiles (id, nome, email, role, ativo)
  VALUES (
    NEW.id,
    v_nome,
    NEW.email,
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

-- ── Mantém profiles.email em dia se o e-mail de login mudar (raro) ─────────────
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET    email = NEW.email
  WHERE  id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_updated ON auth.users;
CREATE TRIGGER on_auth_user_email_updated
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  WHEN (OLD.email IS DISTINCT FROM NEW.email)
  EXECUTE FUNCTION public.sync_profile_email();

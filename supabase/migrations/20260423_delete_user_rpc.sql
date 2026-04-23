-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: delete_user
-- Remove o perfil E a conta Auth do usuário alvo.
-- Só pode ser chamada por admin; impede auto-exclusão.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_user(target_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Somente admin pode executar
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores podem excluir usuários';
  END IF;

  -- Impede que o admin exclua a própria conta
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Não é possível excluir a própria conta';
  END IF;

  -- Remove o perfil (outras tabelas com FK para profiles devem usar ON DELETE SET NULL / CASCADE)
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Remove a conta de autenticação
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Revoga execução pública; apenas usuários autenticados podem chamar
REVOKE ALL ON FUNCTION public.delete_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user(UUID) TO authenticated;

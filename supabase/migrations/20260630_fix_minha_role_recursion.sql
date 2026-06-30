-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: minha_role() causava recursão infinita na RLS de profiles.
--
-- A política de SELECT em profiles é:
--   (id = auth.uid()) OR (minha_role() = 'admin')
-- minha_role() faz "select role from profiles where id = auth.uid()" — sem
-- SECURITY DEFINER, essa consulta interna também passa pela RLS de profiles,
-- que chama minha_role() de novo, e de novo, até estourar a pilha
-- ("stack depth limit exceeded", erro 54001).
--
-- Sintoma: ler o próprio perfil funcionava (cai no primeiro termo do OR,
-- não precisa avaliar minha_role()); listar vários perfis de uma vez
-- (ex: dropdown de coordenadores) quebrava com 500.
--
-- Fix: SECURITY DEFINER faz a consulta interna rodar sem RLS, quebrando a
-- recursão. Função só retorna o role do próprio usuário logado — não
-- expõe nada além do que auth.uid() já garante.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.minha_role()
RETURNS role_usuario
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select role from profiles where id = auth.uid()
$$;

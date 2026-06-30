-- ─────────────────────────────────────────────────────────────────────────────
-- Modelo de conta compartilhada: a importação automática agora é gerenciada
-- centralizadamente (uma conexão Google serve todos os coordenadores), não
-- mais uma conexão por coordenador. Dois ajustes:
--
-- 1. google_automation_status(): função seguray que informa só "tem alguma
--    conexão ativa?" sem expor o refresh_token (sensível) a quem não é o
--    dono da linha — RLS de google_tokens continua restrita por padrão.
-- 2. Admins podem desativar (DELETE) qualquer conexão, não só a própria —
--    necessário porque quem gerencia a integração nem sempre é quem clicou
--    em "Ativar" originalmente.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.google_automation_status()
RETURNS TABLE(ativo boolean, atualizado_em timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (count(*) > 0) AS ativo, max(updated_at) AS atualizado_em
  FROM google_tokens;
$$;

GRANT EXECUTE ON FUNCTION public.google_automation_status() TO authenticated;

DROP POLICY IF EXISTS "Admins can delete any google token" ON google_tokens;
CREATE POLICY "Admins can delete any google token"
  ON google_tokens FOR DELETE TO authenticated
  USING ( minha_role() = 'admin' );

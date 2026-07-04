-- Status aberto/resolvido para observacoes tipo 'ocorrencia' — permite que o
-- painel de "problemas abertos" (Acompanhamento) trate ocorrências criadas no
-- KTM com a mesma semântica que já existe em nexus_incidents.resolved.
-- Demais tipos (reuniao, feedback_*) ignoram o campo (fica false por default,
-- sem ação de UI associada).

ALTER TABLE public.observacoes ADD COLUMN IF NOT EXISTS resolvido BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.observacoes ADD COLUMN IF NOT EXISTS resolvido_em TIMESTAMPTZ;

COMMENT ON COLUMN public.observacoes.resolvido IS
  'Só relevante para tipo = ocorrencia. Marca se o problema já foi tratado.';

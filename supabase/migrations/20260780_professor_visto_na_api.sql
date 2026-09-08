-- ─────────────────────────────────────────────────────────────────────────────
-- Objetivo (2026-09-04): parar de tratar como ATIVO quem a API do King já não
-- devolve — e, com isso, parar de mandar e-mail pra quem saiu da escola.
--
-- O problema: o `kms-api-sync` só faz UPSERT do que a API devolve. Não existe
-- passo de reconciliação, então quem SOME do feed nunca vira 'desligado' e fica
-- `status='ativo'` para sempre. Como todo o resto do sistema (painel de
-- acompanhamento, /emails, contatos do dia) filtra por `status IN
-- ('ativo','pausa')`, essa pessoa continua elegível a disparo indefinidamente.
--
-- Pior: o snapshot em `professor_acompanhamento` congela junto, guardando
-- `reuniao_status='precisa_marcar'` e uma `reuniao_ultima` velha que nunca mais
-- melhora. O "tempo sem reunião" só cresce, então o fantasma sobe pro TOPO da
-- lista de prioridade e é escolhido em todo disparo. Caso real: Luiza Rebellato
-- Garcia (kms 1595) sumiu do feed em 30/07 e levou 8 e-mails "URGENTE: agendar
-- reunião" entre 24/08 e 04/09, já fora da escola.
--
-- A solução tem duas peças:
--   1. `professores.visto_na_api_em` — carimbo de "a API devolveu esta pessoa",
--      escrito a cada rodada do sync. É o que faz a ausência ser VISÍVEL: sem
--      ele, sumir do feed é indistinguível de nunca ter mudado.
--   2. `reconciliar_professores_ausentes()` — dá baixa em quem passou da
--      carência sem aparecer. Chamada pelo sync SÓ quando a rodada fecha limpa
--      (ver as travas na Edge Function).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE professores
  ADD COLUMN IF NOT EXISTS visto_na_api_em TIMESTAMPTZ;

COMMENT ON COLUMN professores.visto_na_api_em IS
  'Última rodada do kms-api-sync em que a API do King devolveu este professor. NULL = nunca veio da API (cadastro manual/teste) — esses NUNCA são desligados automaticamente. Base de reconciliar_professores_ausentes().';

CREATE INDEX IF NOT EXISTS idx_professores_visto_na_api
  ON professores (visto_na_api_em) WHERE status = 'ativo';

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- `professor_acompanhamento.updated_at` é justamente o instante em que o sync
-- gravou o snapshot vindo da API, ou seja: exatamente a informação que a coluna
-- nova quer guardar, já disponível retroativamente. Quem não tem snapshot fica
-- NULL de propósito (cadastro manual — fora do alcance da reconciliação).
UPDATE professores p
   SET visto_na_api_em = a.updated_at
  FROM professor_acompanhamento a
 WHERE a.professor_id = p.id
   AND p.visto_na_api_em IS NULL;

-- ── Reconciliação ────────────────────────────────────────────────────────────
-- Dá baixa em quem está 'ativo' mas sumiu do feed há mais que a carência.
--
-- Três guardas dentro da própria função (as outras, de integridade da rodada,
-- ficam na Edge Function porque só ela sabe se o ciclo fechou limpo):
--   • `visto_na_api_em IS NOT NULL` — nunca mexe em cadastro manual/teste, que
--     por definição nunca vai aparecer no feed.
--   • `kms_id ~ '^[0-9]+$'` — o id numérico é a marca de quem veio do King.
--     Protege registros como 'TESTE-AGENDAMENTO-JOAO'.
--   • só `status = 'ativo'` — pausado é assunto do fluxo de pausa; desligado já
--     está desligado.
--
-- `desligado_em` recebe a data em que a pessoa foi vista pela última vez, não
-- `now()`: senão a saída cairia no mês da reconciliação e distorceria o gráfico
-- de saídas e o turnover. O trigger `sync_professor_status` respeita o valor
-- explícito (COALESCE) e cuida de `saiu`/`pausa` sozinho.
--
-- `status_manual` NÃO é exceção aqui, e isso é deliberado: a regra da trava
-- (20260718) já diz que "'desligado' do KMS sempre vence — um desligamento real
-- não pode ser mascarado". Um desligamento por ausência é um desligamento real.
CREATE OR REPLACE FUNCTION reconciliar_professores_ausentes(p_graca_dias INT DEFAULT 7)
RETURNS TABLE (id UUID, nome TEXT, kms_id TEXT, visto_em TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE professores p
     SET status       = 'desligado',
         desligado_em = p.visto_na_api_em
   WHERE p.status = 'ativo'
     AND p.visto_na_api_em IS NOT NULL
     AND p.kms_id ~ '^[0-9]+$'
     AND p.visto_na_api_em < now() - make_interval(days => GREATEST(p_graca_dias, 1))
  RETURNING p.id, p.nome, p.kms_id, p.visto_na_api_em;
END;
$$;

COMMENT ON FUNCTION reconciliar_professores_ausentes(INT) IS
  'Desliga professores ativos que a API do King não devolve há mais de p_graca_dias. Só o service_role chama (kms-api-sync), e só quando a rodada fecha sem erro de página.';

-- Só o sync chama. Ninguém logado precisa disso, e é uma ação destrutiva em lote.
REVOKE ALL ON FUNCTION reconciliar_professores_ausentes(INT) FROM PUBLIC;
REVOKE ALL ON FUNCTION reconciliar_professores_ausentes(INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION reconciliar_professores_ausentes(INT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Pausas: libera a equipe de Suporte a trabalhar a fila (2026-07-31).
--
-- Até aqui só coordenação, Suporte ao Aluno e admin conseguiam assumir / largar /
-- concluir / recusar solicitações de pausa (gate `pode_gerir_pausa`). O pedido é
-- que a equipe de Suporte (role `suporte`) também consiga concluir os processos
-- de pausa, junto do Suporte ao Aluno.
--
-- Mudança mínima e aditiva: acrescenta `suporte` ao gate. Não mexe em
-- `pode_encerrar_pausa` — tirar o professor da pausa ("Tirar da pausa") continua
-- exclusivo da coordenação, porque "a pausa só encerra a partir do contato com a
-- coordenação" (regra do negócio, ver 20260738_pausas.sql).
--
-- A página /pausas (chave de permissão `retorno-pausa`) já inclui `suporte` no
-- acesso padrão; e os botões da fila não têm trava de cargo no front — o único
-- ponto que barrava o Suporte era esta função. Ver AcompanhamentoPausasPage.tsx.
-- ─────────────────────────────────────────────────────────────────────────────

/** Quem trabalha a FILA de pausas: coordenação, Suporte, Suporte ao Aluno e
 *  admin. (Encerrar a pausa continua restrito à coordenação — pode_encerrar_pausa.) */
CREATE OR REPLACE FUNCTION pode_gerir_pausa() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((
    SELECT is_admin OR role IN ('admin', 'coordenacao', 'suporte', 'suporte_aluno')
    FROM profiles WHERE id = auth.uid()
  ), false);
$$;
GRANT EXECUTE ON FUNCTION pode_gerir_pausa() TO authenticated;

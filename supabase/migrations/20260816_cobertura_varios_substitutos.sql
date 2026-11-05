-- ─────────────────────────────────────────────────────────────────────────────
-- Cobertura de agendamento: mais de um coordenador pode cobrir a mesma ausência
--
-- A 20260814 só aceitava UM substituto por período: o trigger recusava qualquer
-- cobertura do mesmo coordenador ausente que encostasse no período de outra.
-- Na prática a coordenação é em três (Caio, Ariel e João), então quando um sai
-- de férias os OUTROS DOIS é que absorvem o grupo dele — dividir duas semanas de
-- reuniões entre duas agendas é o jeito realista, e dá mais horário livre pro
-- professor achar.
--
-- A regra passa a valer por PAR (ausente, substituto): o mesmo substituto não
-- pode ter dois períodos encavalados pro mesmo ausente (isso é duplicata), mas
-- dois substitutos diferentes podem cobrir o mesmo período. Isso também libera
-- dividir a ausência em pedaços — Caio na primeira semana, Ariel na segunda.
--
-- Uma linha por par, então: nada de array de substitutos. Encerrar a cobertura
-- de um não mexe na do outro, que é o que se quer quando um dos dois também
-- precisa se ausentar no meio do caminho.
--
-- O portal passa a oferecer a agenda de CADA substituto (ver
-- portal-agendamento-lookup e portal-welcome-path). O fallback mudou junto, lá:
-- a 20260814 caía no link do titular quando o substituto não tinha o link
-- cadastrado; com vários, só cai no titular se NENHUM deles tiver — tendo um,
-- oferece a agenda de quem tem, que é melhor que a agenda de quem viajou.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validar_cobertura_agendamento()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT e_coordenador_agendamento(NEW.substituto_id) THEN
    RAISE EXCEPTION 'Quem cobre precisa ser um coordenador ativo.';
  END IF;

  -- Duplicata = MESMO substituto cobrindo o MESMO ausente em período que encosta.
  -- Dois substitutos diferentes no mesmo período é justamente o caso novo.
  IF NEW.encerrada_em IS NULL AND EXISTS (
    SELECT 1 FROM coordenacao_coberturas c
     WHERE c.coordenador_ausente_id = NEW.coordenador_ausente_id
       AND c.substituto_id          = NEW.substituto_id
       AND c.id <> NEW.id
       AND c.encerrada_em IS NULL
       AND c.inicio <= NEW.fim
       AND c.fim    >= NEW.inicio
  ) THEN
    RAISE EXCEPTION 'Esse coordenador já está cobrindo um período que encosta nesse. Encerre a outra cobertura primeiro.';
  END IF;

  RETURN NEW;
END
$fn$;

-- O índice da 20260814 é (coordenador_ausente_id, inicio, fim) e serve tanto a
-- checagem acima quanto a busca do portal; o substituto entra como filtro em
-- cima de pouquíssimas linhas. Fica como está.

COMMENT ON COLUMN coordenacao_coberturas.substituto_id IS
  'Coordenador que atende no período. O portal usa os links de agendamento DELE. Vários substitutos podem cobrir a mesma ausência — uma linha por par (ausente, substituto), e o portal oferece a agenda de cada um.';

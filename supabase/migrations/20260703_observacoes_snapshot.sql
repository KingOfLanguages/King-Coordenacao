-- Snapshot "foto do momento" em observacoes — congela dados operacionais do
-- professor (score, pendencias, faltas, no-show, alunos) no instante em que a
-- observacao e criada, ja que professor_acompanhamento e sobrescrita a cada
-- sync horario do kms-api-sync e nao guarda historico.
--
-- observacoes e uma tabela viva nao rastreada em migrations anteriores
-- (criada direto no SQL Editor); colunas/constraints/RLS confirmadas via
-- information_schema antes desta migration: professor_id/coordenador_id/
-- reuniao_id sao UUID com FK, RLS restringe tudo a admin/coordenacao via
-- minha_role().

ALTER TABLE public.observacoes ADD COLUMN IF NOT EXISTS snapshot JSONB;

COMMENT ON COLUMN public.observacoes.snapshot IS
  'Foto do professor_acompanhamento + contagem de professor_alunos_kms no momento da criacao da observacao. Congelado via trigger, nunca atualizado depois.';

CREATE OR REPLACE FUNCTION public.capturar_snapshot_observacao()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acomp      professor_acompanhamento%ROWTYPE;
  v_encontrado BOOLEAN := FALSE;
  v_qtd_alunos INTEGER := 0;
BEGIN
  SELECT * INTO v_acomp
  FROM professor_acompanhamento
  WHERE professor_id = NEW.professor_id;

  v_encontrado := FOUND;

  SELECT count(*) INTO v_qtd_alunos
  FROM professor_alunos_kms
  WHERE professor_id = NEW.professor_id;

  NEW.snapshot := jsonb_build_object(
    'acompanhamento_encontrado', v_encontrado,
    'capturado_em', NOW(),
    'score_atual', v_acomp.score_atual,
    'score_faixa', v_acomp.score_faixa,
    'elegivel_alocacao', v_acomp.elegivel_alocacao,
    'avaliacao_alunos', v_acomp.avaliacao_alunos,
    'reuniao_status', v_acomp.reuniao_status,
    'reuniao_ultima', v_acomp.reuniao_ultima,
    'reuniao_proxima', v_acomp.reuniao_proxima,
    'aulas_pendentes_qtd', v_acomp.aulas_pendentes_qtd,
    'aulas_pendentes_data_mais_antiga', v_acomp.aulas_pendentes_data_mais_antiga,
    'faltas_professor', v_acomp.faltas_professor,
    'no_show_primeira_aula', v_acomp.no_show_primeira_aula,
    'agendas_bloqueadas', v_acomp.agendas_bloqueadas,
    'trocas_professor', v_acomp.trocas_professor,
    'turnover_entrou_no_periodo', v_acomp.turnover_entrou_no_periodo,
    'turnover_saida', v_acomp.turnover_saida,
    'quantidade_alunos', v_qtd_alunos,
    'api_atualizado_em', v_acomp.api_atualizado_em
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capturar_snapshot_observacao ON public.observacoes;
CREATE TRIGGER trg_capturar_snapshot_observacao
  BEFORE INSERT ON public.observacoes
  FOR EACH ROW EXECUTE FUNCTION public.capturar_snapshot_observacao();

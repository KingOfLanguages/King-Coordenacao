-- ─────────────────────────────────────────────────────────────────────────────
-- Alocação diária de grupo — todo professor precisa de uma coordenação.
--
-- O buraco: `trg_atribuir_grupo` é BEFORE **INSERT** e só age quando o professor
-- já chega com status 'ativo'. Quem entra 'desligado'/'pausa' e é reativado
-- depois nunca mais é revisitado — o kms-api-sync faz upsert por kms_id, então
-- para quem já existe a operação é UPDATE e o trigger não dispara. Resultado em
-- 2026-08-10: 5 professores ativos (e 4 em pausa) sem grupo desde a carga
-- inicial de 2026-07-01, invisíveis em tudo que recorta por coordenação —
-- turnover, Dashboard Geral filtrado, Acompanhamento, meta de reuniões, sorteio
-- das mensagens do dia.
--
-- A regra de escolha continua sendo a NOSSA (`pick_grupo_novo_professor`: grupo
-- com menos ativos, desempate por menos recém-contratados). O campo
-- `coordenador` que a API do King manda segue ignorado de propósito — decisão
-- reafirmada em 2026-08-10.
-- ─────────────────────────────────────────────────────────────────────────────

-- Inclui quem está em 'pausa': sem isso o professor volta da pausa já órfão, que
-- é exatamente o caso que criou os 5 de hoje. Desligado fica de fora — não
-- precisa de coordenação e são ~960 linhas de ruído.
--
-- O loop é proposital: `pick_grupo_novo_professor` conta os ativos de cada grupo,
-- e cada UPDATE muda essa contagem. Um UPDATE ... FROM único alocaria todo mundo
-- no mesmo grupo, porque todos veriam o mesmo snapshot. Em plpgsql cada comando
-- pega um snapshot novo, então o balanceamento acontece de verdade.

CREATE OR REPLACE FUNCTION alocar_professores_sem_grupo()
RETURNS TABLE (professor_id UUID, professor_nome TEXT, grupo_nome TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  r       RECORD;
  v_grupo UUID;
BEGIN
  FOR r IN
    SELECT p.id, p.nome
    FROM professores p
    WHERE p.grupo_id IS NULL
      AND p.status IN ('ativo', 'pausa')
    -- Mais antigo de casa primeiro: quem está órfão há mais tempo sai na frente.
    ORDER BY p.data_inicio NULLS LAST, p.created_at
  LOOP
    v_grupo := pick_grupo_novo_professor();
    CONTINUE WHEN v_grupo IS NULL;  -- nenhum grupo ativo cadastrado

    UPDATE professores
       SET grupo_id       = v_grupo,
           coordenador_id = COALESCE(
             coordenador_id,
             (SELECT g.coordenador_id FROM grupos g WHERE g.id = v_grupo)
           )
     WHERE id = r.id;

    professor_id   := r.id;
    professor_nome := r.nome;
    grupo_nome     := (SELECT g.nome FROM grupos g WHERE g.id = v_grupo);
    RETURN NEXT;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION alocar_professores_sem_grupo() IS
  'Aloca grupo (e coordenador) a todo professor ativo/em pausa sem grupo, pela regra de balanceamento própria. Roda na cron king-alocar-grupo e é idempotente — sem órfãos, não faz nada.';

REVOKE ALL ON FUNCTION alocar_professores_sem_grupo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION alocar_professores_sem_grupo() TO authenticated;

-- ── Cron diária ──────────────────────────────────────────────────────────────
-- 04:00: depois das rotinas de pausa (03:10/03:20), que podem devolver
-- professores ao status ativo, e antes da detecção de silêncio (06:00) e da
-- geração das mensagens do dia (09:00), que já leem o grupo.

SELECT cron.unschedule('king-alocar-grupo')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-alocar-grupo');

SELECT cron.schedule(
  'king-alocar-grupo',
  '0 4 * * *',
  $$ SELECT alocar_professores_sem_grupo(); $$
);

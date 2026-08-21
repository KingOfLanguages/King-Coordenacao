-- ─────────────────────────────────────────────────────────────────────────────
-- Transferência de aluno: PRAZO DE ATENDIMENTO explícito + escalonamento para a
-- liderança do Suporte ao Aluno (2026-08-21).
--
-- 20260761 criou a régua do PROFESSOR: com quantos dias úteis de antecedência
-- ele avisou. Faltava a régua do NOSSO lado — até quando *nós* temos que
-- resolver o pedido. Sem ela, a fila só dizia "a última aula é dia tal"; nada
-- dizia, olhando a tela, quais pedidos já passaram do combinado.
--
-- O compromisso da operação (mesmo texto de 20260761): transferir em até
-- 7 DIAS ÚTEIS a partir do envio do formulário. Daí:
--
--     prazo_limite = MENOR( envio + 7 dias úteis , data da última aula )
--
-- A última aula entra como teto porque, quando o professor avisa em cima da
-- hora (abaixo dos 7 úteis), o combinado não vale mais: o que manda é a data em
-- que o aluno para. Resolver depois disso é deixar o aluno sem professor.
--
-- Passou do limite e o pedido ainda está aberto → ATRASADO, e o atraso sobe uma
-- vez por pedido para a liderança do Suporte ao Aluno (o sino do app, mesmo
-- canal do "chamado crítico"). Uma vez só: a fila na tela é que mostra o
-- estoque de atrasados; a notificação existe para avisar do que ACABOU de
-- estourar, não para repetir todo dia o que já se sabe.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. N-ésimo dia útil a partir de uma data ─────────────────────────────────

/**
 * Data do N-ésimo dia útil (seg–sex) a partir de `p_de`, INCLUSIVE — mesma
 * semântica de `somarDiasUteis` em src/lib/diasUteis.ts e coerente com
 * `dias_uteis_entre` (que também conta as duas pontas): se `p_de` é uma segunda,
 * `dias_uteis_depois(p_de, 7)` é a terça da semana seguinte, e
 * `dias_uteis_entre(p_de, esse_resultado)` = 7.
 *
 * Sem feriados, pelo mesmo motivo declarado em dias_uteis_entre.
 */
CREATE OR REPLACE FUNCTION dias_uteis_depois(p_de DATE, p_n INTEGER) RETURNS DATE
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT d::date
    FROM generate_series(
           p_de,
           p_de + (GREATEST(p_n, 1) * 2 + 10) * INTERVAL '1 day',
           INTERVAL '1 day'
         ) d
   WHERE EXTRACT(ISODOW FROM d) < 6
   ORDER BY d
   OFFSET GREATEST(p_n, 1) - 1
   LIMIT 1;
$fn$;

COMMENT ON FUNCTION dias_uteis_depois(DATE, INTEGER) IS
  'Data do N-ésimo dia útil a partir de p_de, inclusive. Espelha somarDiasUteis() do front.';

-- ── 2. O prazo de atendimento de um pedido ───────────────────────────────────

/**
 * Até quando o Suporte ao Aluno tem para resolver o pedido.
 *
 * STABLE e não IMMUTABLE porque `timestamptz::date` depende do TimeZone da
 * sessão — o mesmo motivo pelo qual o resto do módulo usa CURRENT_DATE.
 */
CREATE OR REPLACE FUNCTION transferencia_prazo_limite(
  p_created TIMESTAMPTZ, p_ultima_aula DATE
) RETURNS DATE
LANGUAGE sql STABLE AS $fn$
  SELECT LEAST(dias_uteis_depois(p_created::date, 7), p_ultima_aula);
$fn$;

COMMENT ON FUNCTION transferencia_prazo_limite(TIMESTAMPTZ, DATE) IS
  'Prazo de atendimento: menor entre (envio + 7 dias úteis) e a data da última aula. Espelha prazoAtendimento() em src/hooks/useTransferencias.ts.';

GRANT EXECUTE ON FUNCTION dias_uteis_depois(DATE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION transferencia_prazo_limite(TIMESTAMPTZ, DATE) TO authenticated;

-- ── 3. Colunas novas ─────────────────────────────────────────────────────────

-- Marca de "a liderança já foi avisada deste atraso". Serve de trava de
-- idempotência: a cron pode rodar quantas vezes quiser sem duplicar o aviso.
ALTER TABLE transferencias_aluno
  ADD COLUMN IF NOT EXISTS alerta_atraso_em TIMESTAMPTZ;

COMMENT ON COLUMN transferencias_aluno.alerta_atraso_em IS
  'Quando o atraso deste pedido foi escalado para a liderança do Suporte ao Aluno. NULL = ainda não escalado.';

-- O sino só sabia navegar para incidentes (notificacoes.incidente_id). `link` é
-- o destino genérico — qualquer rota do app — para avisos que não são chamados.
ALTER TABLE notificacoes
  ADD COLUMN IF NOT EXISTS link TEXT;

COMMENT ON COLUMN notificacoes.link IS
  'Rota interna a abrir ao clicar no aviso (ex.: /transferencias?pedido=UUID). Tem precedência sobre incidente_id.';

-- Varredura da cron: só os abertos ainda não escalados.
CREATE INDEX IF NOT EXISTS idx_transf_alerta_pendente
  ON transferencias_aluno (data_ultima_aula)
  WHERE status IN ('pendente', 'em_atendimento') AND alerta_atraso_em IS NULL;

-- ── 4. Quem é a liderança do Suporte ao Aluno ────────────────────────────────

/**
 * Destinatários do escalonamento: quem tem o flag de líder DENTRO do cargo
 * suporte_aluno. O flag `is_lider` nasceu para a coordenação (20260704) e aqui
 * passa a valer como "líder do próprio setor" — é a mesma ideia, e evita fixar
 * um nome de pessoa no banco.
 *
 * Sem ninguém marcado, cai nos admins: um aviso que não tem para quem ir é um
 * aviso perdido, e o buraco (ninguém marcado como líder) precisa aparecer para
 * alguém que consiga corrigi-lo em /admin/usuarios.
 */
CREATE OR REPLACE FUNCTION lideranca_suporte_aluno()
RETURNS TABLE (perfil_id UUID)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  WITH lideres AS (
    SELECT p.id FROM profiles p
     WHERE p.ativo AND p.is_lider = true AND p.role = 'suporte_aluno'
  )
  SELECT l.id FROM lideres l
  UNION
  SELECT p.id FROM profiles p
   WHERE p.ativo AND (p.is_admin = true OR p.role = 'admin')
     AND NOT EXISTS (SELECT 1 FROM lideres);
$fn$;

COMMENT ON FUNCTION lideranca_suporte_aluno() IS
  'Perfis que recebem o escalonamento do Suporte ao Aluno: role=suporte_aluno com is_lider; sem nenhum marcado, os admins.';

-- ── 5. A varredura diária ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION notificar_transferencias_atrasadas() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  r        RECORD;
  v_qtd    INTEGER := 0;
  v_atraso INTEGER;
  v_plural TEXT;
BEGIN
  FOR r IN
    SELECT t.id, t.aluno_nome, t.status,
           transferencia_prazo_limite(t.created_at, t.data_ultima_aula) AS limite,
           p.nome AS professor_nome
      FROM transferencias_aluno t
      JOIN professores p ON p.id = t.professor_id
     WHERE t.status IN ('pendente', 'em_atendimento')
       AND t.alerta_atraso_em IS NULL
       AND transferencia_prazo_limite(t.created_at, t.data_ultima_aula) < CURRENT_DATE
     ORDER BY t.created_at
  LOOP
    -- dias_uteis_entre conta as duas pontas; o próprio dia do vencimento não é atraso.
    v_atraso := GREATEST(dias_uteis_entre(r.limite, CURRENT_DATE) - 1, 1);
    v_plural := CASE WHEN v_atraso = 1 THEN ' dia útil' ELSE ' dias úteis' END;

    INSERT INTO notificacoes (user_id, tipo, titulo, corpo, link)
    SELECT l.perfil_id,
           'transferencia_atrasada',
           'Transferência atrasada: ' || r.aluno_nome,
           'Pedido de ' || r.professor_nome || '. O prazo venceu em ' ||
             to_char(r.limite, 'DD/MM') || ' (' || v_atraso || v_plural || ' de atraso). ' ||
             CASE WHEN r.status = 'pendente'
                  THEN 'Ninguém assumiu o pedido ainda.'
                  ELSE 'Já está em atendimento.' END,
           '/transferencias?pedido=' || r.id
      FROM lideranca_suporte_aluno() l;

    UPDATE transferencias_aluno SET alerta_atraso_em = NOW() WHERE id = r.id;
    v_qtd := v_qtd + 1;
  END LOOP;

  RETURN v_qtd;
END;
$fn$;

COMMENT ON FUNCTION notificar_transferencias_atrasadas() IS
  'Escala para a liderança do Suporte ao Aluno cada transferência aberta que passou do prazo de atendimento. Idempotente (alerta_atraso_em). Roda na cron king-transferencia-atraso.';

REVOKE ALL ON FUNCTION notificar_transferencias_atrasadas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION notificar_transferencias_atrasadas() TO authenticated;

-- ── 6. Cron diária ───────────────────────────────────────────────────────────
-- 08:00, no mesmo relógio das demais crons do projeto: depois da detecção de
-- silêncio (06:00) e antes das mensagens do dia (09:00), de modo que o aviso já
-- esteja no sino quando o time abrir o sistema.

SELECT cron.unschedule('king-transferencia-atraso')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'king-transferencia-atraso');

SELECT cron.schedule(
  'king-transferencia-atraso',
  '0 8 * * *',
  $cron$ SELECT notificar_transferencias_atrasadas(); $cron$
);

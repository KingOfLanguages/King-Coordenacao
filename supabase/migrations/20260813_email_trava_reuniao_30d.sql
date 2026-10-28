-- ─────────────────────────────────────────────────────────────────────────────
-- E-mail da coordenação: 30 dias corridos depois da última reunião (2026-10-28).
--
-- Pedido do João: professor que teve reunião no dia X não recebe e-mail nenhum
-- da coordenação — convocação, personalizada ou o botão das Mensagens do dia —
-- até o dia X + 30. A regra dos 15 dias desde o último e-mail (20260787)
-- continua: sem ela, quem não teve reunião recente voltaria a receber e-mail
-- todo dia. Vale a que segurar por mais tempo.
--
-- Última reunião = a mais recente entre as três fontes que a plataforma usa:
--   • reuniao_professores realizada (data da reunião) — a mesma das Mensagens do dia;
--   • professores.data_ultima_reuniao (confirmação aqui, na extensão ou em grupo);
--   • professor_acompanhamento.reuniao_ultima (KMS).
-- Em 28/10: 350 dos 909 ativos com e-mail tiveram reunião nos últimos 30 dias
-- (14 deles só aparecem em reuniao_professores).
--
-- email_trava() é a função nova, com o motivo. email_carencia() vira casca com o
-- contrato antigo: as abas abertas no front anterior leem ultimo_envio sem
-- checar NULL, e as gerar_contatos_dia* seguem chamando ela — na lista normal
-- a reunião dos últimos 30 dias já era filtrada à parte, nos filtros (a)/(b).
-- ─────────────────────────────────────────────────────────────────────────────

-- Uma linha por professor que não pode receber e-mail hoje (fuso de São Paulo,
-- por dia): o último e-mail (se foi nos últimos 15 dias), a última reunião (se
-- foi nos últimos 30), o dia em que volta a poder receber e o que segura até lá.
-- p_professor_ids = NULL devolve todos.
CREATE OR REPLACE FUNCTION email_trava(p_professor_ids uuid[] DEFAULT NULL)
RETURNS TABLE (professor_id uuid, ultimo_envio timestamptz, ultima_reuniao date, libera_em date, motivo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cfg AS (
    SELECT 15 AS dias_email,                                    -- ← desde o último e-mail
           30 AS dias_reuniao,                                  -- ← desde a última reunião
           (now() AT TIME ZONE 'America/Sao_Paulo')::date AS hoje
  ),
  -- (1) E-mail: mesma conta da 20260787 — por professor e pelo mesmo endereço.
  recentes AS (
    SELECT d.professor_id, lower(trim(d.email)) AS email, d.created_at
      FROM email_disparos d, cfg
     WHERE d.sucesso
       -- enviado no dia X ⇒ bloqueado enquanto hoje < X + dias_email
       AND d.created_at >= ((cfg.hoje - (cfg.dias_email - 1))::timestamp AT TIME ZONE 'America/Sao_Paulo')
  ),
  por_email AS (
    SELECT x.professor_id, max(x.created_at) AS ultimo_envio
      FROM (
        SELECT r.professor_id, r.created_at FROM recentes r WHERE r.professor_id IS NOT NULL
        UNION ALL
        SELECT p.id, r.created_at
          FROM recentes r
          JOIN professores p ON lower(trim(p.email)) = r.email
      ) x
     GROUP BY x.professor_id
  ),
  -- (2) Reunião: no dia X ⇒ bloqueado enquanto hoje < X + dias_reuniao.
  reunioes_dia AS (
    SELECT rp.professor_id, (r.data AT TIME ZONE 'America/Sao_Paulo')::date AS dia
      FROM reuniao_professores rp
      JOIN reunioes r ON r.id = rp.reuniao_id
     WHERE rp.status = 'realizada'
    UNION ALL
    SELECT p.id, (p.data_ultima_reuniao AT TIME ZONE 'America/Sao_Paulo')::date
      FROM professores p
     WHERE p.data_ultima_reuniao IS NOT NULL
    UNION ALL
    SELECT pa.professor_id, pa.reuniao_ultima
      FROM professor_acompanhamento pa
     WHERE pa.reuniao_ultima IS NOT NULL
  ),
  por_reuniao AS (
    SELECT rd.professor_id, max(rd.dia) AS ultima_reuniao
      FROM reunioes_dia rd, cfg
     WHERE rd.dia > cfg.hoje - cfg.dias_reuniao
       AND rd.dia <= cfg.hoje                                   -- data no futuro não é reunião feita
     GROUP BY rd.professor_id
  ),
  junto AS (
    SELECT coalesce(e.professor_id, r.professor_id) AS professor_id,
           e.ultimo_envio,
           r.ultima_reuniao,
           (e.ultimo_envio AT TIME ZONE 'America/Sao_Paulo')::date + (SELECT dias_email FROM cfg) AS libera_email,
           r.ultima_reuniao + (SELECT dias_reuniao FROM cfg) AS libera_reuniao
      FROM por_email e
      FULL JOIN por_reuniao r ON r.professor_id = e.professor_id
  )
  SELECT j.professor_id,
         j.ultimo_envio,
         j.ultima_reuniao,
         greatest(j.libera_email, j.libera_reuniao) AS libera_em,
         CASE WHEN j.libera_email IS NULL OR j.libera_reuniao >= j.libera_email
              THEN 'reuniao' ELSE 'email' END AS motivo
    FROM junto j
   WHERE p_professor_ids IS NULL OR j.professor_id = ANY (p_professor_ids);
$$;

COMMENT ON FUNCTION email_trava(uuid[]) IS
  'Professores que não podem receber e-mail da coordenação hoje: reunião nos últimos 30 dias ou e-mail nos últimos 15 (por id ou pelo mesmo endereço). libera_em = o que segurar por mais tempo; motivo = reuniao | email.';

-- Só datas, sem endereço nem conteúdo: qualquer logado pode ler (a tela mostra
-- quem pode e quem não pode receber). As Edge Functions chamam com service_role.
REVOKE ALL ON FUNCTION email_trava(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION email_trava(uuid[]) TO authenticated, service_role;

-- Contrato antigo: só quem recebeu e-mail nos últimos 15 dias (ultimo_envio
-- nunca NULL), com libera_em já contando a reunião.
CREATE OR REPLACE FUNCTION email_carencia(p_professor_ids uuid[] DEFAULT NULL)
RETURNS TABLE (professor_id uuid, ultimo_envio timestamptz, libera_em date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.professor_id, t.ultimo_envio, t.libera_em
    FROM email_trava(p_professor_ids) t
   WHERE t.ultimo_envio IS NOT NULL;
$$;

COMMENT ON FUNCTION email_carencia(uuid[]) IS
  'Contrato antigo de email_trava(): só quem recebeu e-mail nos últimos 15 dias, com o dia em que volta a poder receber (já contando a reunião dos 30 dias).';

REVOKE ALL ON FUNCTION email_carencia(uuid[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION email_carencia(uuid[]) TO authenticated, service_role;

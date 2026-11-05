-- ─────────────────────────────────────────────────────────────────────────────
-- Cobertura de agendamento entre coordenações
--
-- Problema: o Portal de Agendamento (/agendar) resolve o coordenador
-- responsável pelo professor e manda ele pros links DESSE coordenador
-- (profiles.koalendar_link e profiles.google_appointment_link — ver 20260706).
-- Com o coordenador de férias, o grupo dele fica sem reunião: ou não acha
-- horário livre, ou marca num calendário que ninguém vai atender.
--
-- Esta tabela registra "no período X, quem atende o grupo do coordenador A é o
-- coordenador B". Enquanto vale, o /agendar e a tela de conclusão do Welcome
-- Path oferecem os links do substituto, avisando quem vai atender.
--
-- O que a cobertura NÃO muda, de propósito:
--   • professores.grupo_id / coordenador_id — o professor segue do grupo dele;
--   • KPIs da carteira, Índice de atenção, pendências e telas internas —
--     tudo continua atribuído à coordenação titular;
--   • reunião em grupo — o /agendar já mostra as agendas de todos os
--     coordenadores juntas (teacher-lookup), então não precisa de desvio.
--
-- Um salto só: se o substituto também estiver coberto, o desvio NÃO encadeia
-- (evita A→B→A). Fica nos links do substituto direto.
--
-- Quando o substituto não tem um dos links cadastrados, o portal cai de volta
-- no link do titular pra aquele tipo de reunião — melhor um horário no
-- calendário errado do que o professor sem nenhuma opção na tela.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coordenacao_coberturas (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coordenador_ausente_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  substituto_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  inicio                 DATE NOT NULL,
  fim                    DATE NOT NULL,
  motivo                 TEXT,
  criado_por             UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_em           TIMESTAMPTZ,
  encerrada_por          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT coberturas_periodo_valido       CHECK (fim >= inicio),
  CONSTRAINT coberturas_substituto_diferente CHECK (substituto_id <> coordenador_ausente_id)
);

COMMENT ON TABLE coordenacao_coberturas IS
  'Períodos em que o agendamento individual do grupo de um coordenador é redirecionado para outro coordenador (férias, licença, viagem). Só afeta os links do Portal de Agendamento e da conclusão do Welcome Path — grupo, KPIs e pendências ficam com a coordenação titular.';
COMMENT ON COLUMN coordenacao_coberturas.coordenador_ausente_id IS
  'Coordenador que vai se ausentar. O desvio vale pros professores cujo professores.coordenador_id é ele.';
COMMENT ON COLUMN coordenacao_coberturas.substituto_id IS
  'Coordenador que atende no período. O portal usa os links de agendamento DELE.';
COMMENT ON COLUMN coordenacao_coberturas.fim IS
  'Último dia da ausência, inclusive (data civil de São Paulo).';
COMMENT ON COLUMN coordenacao_coberturas.encerrada_em IS
  'Preenchido quando a cobertura é encerrada antes do fim (voltou mais cedo) ou cancelada antes de começar. Linha preenchida nunca vale.';

CREATE INDEX IF NOT EXISTS idx_coberturas_vigencia
  ON coordenacao_coberturas (coordenador_ausente_id, inicio, fim)
  WHERE encerrada_em IS NULL;

-- ── Quem conta como coordenador aqui ──────────────────────────────────────────
-- `role = 'coordenacao'` é a definição certa: pela 20260704 admin é uma FLAG
-- auxiliar, e as contas role='admin' do banco são infra/teste (TI, Lucas, Igor,
-- Denielton) — sem grupo, sem professor e sem link de agendamento. Deixá-las no
-- seletor só daria chance de escolher quem não atende ninguém. O OR do grupo é
-- rede de segurança: quem responde por um grupo entra mesmo com outro cargo.
--
-- SECURITY DEFINER porque lê `profiles`, cuja RLS só mostra a própria linha pra
-- quem não é admin — sem isso, um coordenador comum nunca conseguiria nem provar
-- que o substituto escolhido existe.

CREATE OR REPLACE FUNCTION public.e_coordenador_agendamento(p_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
     WHERE p.id = p_id
       AND p.ativo
       AND (p.role = 'coordenacao' OR EXISTS (SELECT 1 FROM grupos g WHERE g.coordenador_id = p.id))
  )
$$;

GRANT EXECUTE ON FUNCTION public.e_coordenador_agendamento(UUID) TO authenticated;

-- ── Validação ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validar_cobertura_agendamento()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
BEGIN
  IF NOT e_coordenador_agendamento(NEW.substituto_id) THEN
    RAISE EXCEPTION 'Quem cobre precisa ser um coordenador ativo.';
  END IF;

  IF NEW.encerrada_em IS NULL AND EXISTS (
    SELECT 1 FROM coordenacao_coberturas c
     WHERE c.coordenador_ausente_id = NEW.coordenador_ausente_id
       AND c.id <> NEW.id
       AND c.encerrada_em IS NULL
       AND c.inicio <= NEW.fim
       AND c.fim    >= NEW.inicio
  ) THEN
    RAISE EXCEPTION 'Já existe uma cobertura deste coordenador que encosta nesse período. Encerre a outra primeiro.';
  END IF;

  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS trg_validar_cobertura_agendamento ON coordenacao_coberturas;
CREATE TRIGGER trg_validar_cobertura_agendamento
  BEFORE INSERT OR UPDATE ON coordenacao_coberturas
  FOR EACH ROW EXECUTE FUNCTION public.validar_cobertura_agendamento();

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Leitura liberada pra dentro: quem cobre quem é escala do time, e o card
-- precisa listar o histórico. Escrita só do próprio coordenador que vai se
-- ausentar (é ele quem sabe quando viaja), mais admin e liderança.

ALTER TABLE coordenacao_coberturas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coberturas_select" ON coordenacao_coberturas;
CREATE POLICY "coberturas_select" ON coordenacao_coberturas FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "coberturas_insert" ON coordenacao_coberturas;
CREATE POLICY "coberturas_insert" ON coordenacao_coberturas FOR INSERT TO authenticated
  WITH CHECK (coordenador_ausente_id = auth.uid() OR sou_admin() OR sou_lider());

DROP POLICY IF EXISTS "coberturas_update" ON coordenacao_coberturas;
CREATE POLICY "coberturas_update" ON coordenacao_coberturas FOR UPDATE TO authenticated
  USING      (coordenador_ausente_id = auth.uid() OR sou_admin() OR sou_lider())
  WITH CHECK (coordenador_ausente_id = auth.uid() OR sou_admin() OR sou_lider());

DROP POLICY IF EXISTS "coberturas_delete" ON coordenacao_coberturas;
CREATE POLICY "coberturas_delete" ON coordenacao_coberturas FOR DELETE TO authenticated
  USING (coordenador_ausente_id = auth.uid() OR sou_admin() OR sou_lider());

REVOKE ALL ON coordenacao_coberturas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON coordenacao_coberturas TO authenticated;

-- ── Coordenadores elegíveis a cobrir ──────────────────────────────────────────
-- O seletor "quem cobre" precisa listar OUTROS coordenadores, e a RLS de
-- profiles só mostra a própria linha (ver 20260742_perfis_publicos). Esta view
-- expõe o nome e dois BOOLEANOS dizendo se os links de agendamento estão
-- cadastrados — nunca os links em si, que seguem restritos ao dono e ao admin.
-- Mesma régua do trigger: e_coordenador_agendamento().

-- O sub-SELECT no FROM não é enfeite: ele impede que a view seja
-- AUTO-ATUALIZÁVEL. Uma view de tabela única com colunas simples aceitaria
-- INSERT/UPDATE/DELETE repassados para `profiles` — e, rodando como o dono
-- (security_invoker = false), isso passaria por cima da RLS. Com o sub-SELECT,
-- o Postgres recusa qualquer escrita aqui, independente de GRANT. O REVOKE
-- abaixo é a segunda tranca. Ver 20260815.
CREATE OR REPLACE VIEW coordenadores_agendamento AS
  SELECT q.id, q.nome, q.tem_link_primeira, q.tem_link_acompanhamento
  FROM (
    SELECT
      p.id,
      p.nome,
      (p.koalendar_link IS NOT NULL AND btrim(p.koalendar_link) <> '')                   AS tem_link_primeira,
      (p.google_appointment_link IS NOT NULL AND btrim(p.google_appointment_link) <> '') AS tem_link_acompanhamento
    FROM profiles p
    WHERE p.ativo
      AND (p.role = 'coordenacao' OR EXISTS (SELECT 1 FROM grupos g WHERE g.coordenador_id = p.id))
  ) q;

ALTER VIEW coordenadores_agendamento SET (security_invoker = false);

COMMENT ON VIEW coordenadores_agendamento IS
  'Coordenadores ativos + se já cadastraram cada link de agendamento (só o booleano, nunca o link). Usada pelo seletor de cobertura, que precisa ver os outros coordenadores sem afrouxar a RLS de profiles.';

REVOKE ALL ON coordenadores_agendamento FROM PUBLIC;
REVOKE ALL ON coordenadores_agendamento FROM anon;
-- `authenticated` recebe ALL por default no schema public (Supabase), e REVOKE
-- de PUBLIC/anon não tira isso. Uma view security_invoker=false com colunas
-- simples é AUTO-ATUALIZÁVEL: a escrita rodaria como o dono da view e passaria
-- por cima da RLS de profiles. Só leitura, então. Ver 20260815.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON coordenadores_agendamento FROM authenticated;
GRANT SELECT ON coordenadores_agendamento TO authenticated;

-- ── Coberturas com nomes e estado ─────────────────────────────────────────────
-- security_invoker = true: a RLS de coordenacao_coberturas continua valendo.
-- Os nomes vêm de perfis_publicos (que ignora a RLS de profiles por conta
-- própria), então um coordenador comum lê o nome do colega sem ver mais nada.

CREATE OR REPLACE VIEW coberturas_agendamento AS
  SELECT
    c.id,
    c.coordenador_ausente_id,
    pa.nome AS coordenador_ausente_nome,
    c.substituto_id,
    ps.nome AS substituto_nome,
    c.inicio,
    c.fim,
    c.motivo,
    c.criado_por,
    c.created_at,
    c.encerrada_em,
    (c.encerrada_em IS NULL AND CURRENT_DATE BETWEEN c.inicio AND c.fim) AS vigente,
    (c.encerrada_em IS NULL AND c.inicio > CURRENT_DATE)                 AS agendada,
    g.grupos AS grupos_cobertos
  FROM coordenacao_coberturas c
  LEFT JOIN perfis_publicos pa ON pa.id = c.coordenador_ausente_id
  LEFT JOIN perfis_publicos ps ON ps.id = c.substituto_id
  LEFT JOIN LATERAL (
    SELECT string_agg(gr.nome, ', ' ORDER BY gr.nome) AS grupos
      FROM grupos gr
     WHERE gr.coordenador_id = c.coordenador_ausente_id
  ) g ON TRUE;

ALTER VIEW coberturas_agendamento SET (security_invoker = true);

COMMENT ON VIEW coberturas_agendamento IS
  'Coberturas de agendamento com os nomes resolvidos, os grupos afetados e o estado calculado (vigente / agendada). Leitura da aba Reuniões › Configurar agendas.';

REVOKE ALL ON coberturas_agendamento FROM anon;
GRANT SELECT ON coberturas_agendamento TO authenticated;

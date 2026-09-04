-- ─────────────────────────────────────────────────────────────────────────────
-- Projetos: corrige o vocabulário de "onde será aplicado".
--
-- A ficha nasceu (20260777) assumindo que "a plataforma" era ESTA ferramenta,
-- a de Gestão dos Professores. Está errado: quando o time diz "a plataforma",
-- fala do **King Management System** e/ou da **plataforma do aluno**. Como esse
-- campo é a primeira coisa que o TI lê para saber quem toca o projeto, chamar
-- de "plataforma" a ferramenta errada mandaria o projeto para a fila errada.
--
-- Passa a existir uma opção por superfície de verdade. O valor antigo
-- 'plataforma' significava a ferramenta interna, então vira 'gestao'.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projetos DROP CONSTRAINT IF EXISTS projetos_onde_aplicado_check;

UPDATE projetos SET onde_aplicado = 'gestao' WHERE onde_aplicado = 'plataforma';

ALTER TABLE projetos ADD CONSTRAINT projetos_onde_aplicado_check
  CHECK (onde_aplicado IS NULL OR onde_aplicado IN (
    'kms',       -- King Management System
    'aluno',     -- Plataforma do aluno
    'gestao',    -- Esta ferramenta (Gestão dos Professores)
    'extensao',  -- Extensão do Meet
    'portal',    -- Portais públicos do professor (agendamento, pausa, transferência…)
    'processo',  -- Rotina do time; não necessariamente vira software
    'outro'
  ));

COMMENT ON COLUMN projetos.onde_aplicado IS
  'Superfície onde a mudança encosta. "A plataforma" do time = kms (King Management System) '
  'ou aluno (plataforma do aluno); gestao é esta ferramenta interna.';

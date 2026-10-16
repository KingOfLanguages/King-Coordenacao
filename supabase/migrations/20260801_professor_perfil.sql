-- ─────────────────────────────────────────────────────────────────────────────
-- Perfil do professor vindo do onboarding do King (2026-10-16).
--
-- O King exporta o formulário de onboarding do professor ("onboarding-
-- professores-AAAA-MM-DD.csv"). Daqui guardamos SÓ o que serve à gestão:
-- formação, experiência, como ele dá aula, as preferências (público, níveis,
-- idiomas…) e o vídeo de apresentação. Para a equipe filtrar professores por
-- preferência — principalmente quem dá aula para criança.
--
-- FICAM DE FORA, de propósito: data de nascimento, gênero, CEP, endereço,
-- número, complemento, Instagram e qualquer dado bancário. Contato (e-mail,
-- telefone, cidade, estado) já está em `professores`. A "vitrine" para o aluno
-- (personalidade, hobbies, assuntos, curiosidade, recado) segue só no King.
--
-- Tabela separada (1:1) em vez de colunas em `professores`: a lista de
-- professores e o painel não dependem dela — se esta tabela faltar, só os
-- filtros de preferência somem.
--
-- Os textos ficam como o King grava ("Crianças", "Do zero absoluto"…), sem
-- CHECK: se o formulário ganhar uma opção, o import não quebra.
--
-- Quem escreve: só o import (SQL direto, por kms_id). Sem política de escrita
-- para o cliente. Leitura: qualquer usuário logado, como `professores`.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS professor_perfil (
  professor_id             UUID        PRIMARY KEY REFERENCES professores(id) ON DELETE CASCADE,
  nome_preferido           TEXT,

  -- Formação e experiência
  formacao                 TEXT,        -- 'Estou cursando' | 'Já concluí' | 'Não tenho'
  curso                    TEXT,
  curso_conclusao_ano      SMALLINT,
  curso_turno              TEXT,        -- Manhã | Tarde | Noite | Integral | EAD
  tem_certificado          BOOLEAN,
  certificado              TEXT,
  experiencia_exterior     BOOLEAN,
  exterior_local           TEXT,
  leciona_desde            SMALLINT,    -- ano em que começou a dar aula

  -- Como dá aula (escala 1–5 do formulário)
  estilo_estrutura         SMALLINT CHECK (estilo_estrutura BETWEEN 1 AND 5),  -- 1 deixo a conversa levar · 5 sigo o plano à risca
  estilo_correcao          SMALLINT CHECK (estilo_correcao  BETWEEN 1 AND 5),  -- 1 corrijo na hora · 5 corrijo no fim
  estilo_ritmo             SMALLINT CHECK (estilo_ritmo     BETWEEN 1 AND 5),  -- 1 puxo o ritmo · 5 sigo o tempo do aluno
  quando_aluno_trava       TEXT,
  portugues_em_aula        TEXT,
  variante_ingles          TEXT,
  alunos_neurodivergentes  TEXT,        -- experiência do professor com esse aluno

  -- Preferências (múltipla escolha)
  idiomas                  TEXT[],      -- 'Inglês - Avançado', 'Espanhol - Intermediário'…
  publico                  TEXT[],      -- Adultos, Adolescentes, Crianças, 60+, Turmas em grupo, Executivos e corporativo
  niveis                   TEXT[],
  objetivos                TEXT[],
  areas                    TEXT[],
  alunos_que_destrava      TEXT[],

  -- Três estados: true marcou Crianças; false respondeu o público sem marcar;
  -- NULL não respondeu (não é o mesmo que "não dá aula para criança").
  atende_criancas          BOOLEAN GENERATED ALWAYS AS (
                             CASE WHEN publico IS NULL OR cardinality(publico) = 0 THEN NULL
                                  ELSE 'Crianças' = ANY (publico) END
                           ) STORED,

  -- Vídeo de apresentação
  video_status             TEXT,        -- Sem vídeo | Em análise | Aprovado | Reprovado
  video_enviado_em         TIMESTAMPTZ,
  video_revisado_em        TIMESTAMPTZ,
  video_motivo_reprovacao  TEXT,

  -- Origem
  onboarding_atualizado_em TIMESTAMPTZ, -- última edição do professor no King
  fonte                    TEXT        NOT NULL,  -- nome do arquivo exportado
  importado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE professor_perfil IS
  'Perfil do professor do onboarding do King (formação, como dá aula, preferências, vídeo). Sem dados pessoais. Preenchido por import do export do King, casando por professores.kms_id.';
COMMENT ON COLUMN professor_perfil.atende_criancas IS
  'true = marcou Crianças no público; false = respondeu o público sem Crianças; NULL = não respondeu.';
COMMENT ON COLUMN professor_perfil.leciona_desde IS
  'Ano em que começou a dar aula. Guardar o ano, não "anos lecionando" (envelhece).';

ALTER TABLE professor_perfil ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS professor_perfil_select ON professor_perfil;
CREATE POLICY professor_perfil_select ON professor_perfil
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON professor_perfil TO authenticated;

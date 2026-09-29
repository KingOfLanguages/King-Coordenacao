-- Welcome Path · ajustes do parecer do RH ("Onboarding Teachers", 29/09).
-- Aplicar DEPOIS de 2026-09-29_welcome_path_conhecendo_plataforma.sql e
-- 2026-09-29_welcome_path_lancamento_aulas.sql (a ordem final usa as duas).
-- Cada mudança só acontece se o texto antigo ainda estiver lá (replace) ou se o
-- bloco novo ainda não existir (NOT EXISTS): rodar de novo não duplica nada.
--
-- Etapas que estão no ar:
--   Boas-vindas ........ lista dos acessos para conferir (o vídeo de primeiros
--                         passos entra quando houver versão sem o Kit e o grupo antigo)
--   Primeiro Contato ... descrição sem "grupo"; o contrato também chega pelo
--                         WhatsApp; seção nova "Meu Onboarding" com prática
--   Primeira aula ...... sem o vídeo de boas-vindas repetido; links das aulas
--                         mudam a cada aula; getting to know ANTES do nivelamento
--   Boas Práticas ...... critérios de reposição resumidos
-- Etapas novas (desativadas): Teacher Ju (A King por dentro), recursos externos
-- gratuitos e personalização pela conversa (Metodologia), feedback em pontos
-- fortes e de melhoria falando em "nós" (Avaliação), falta em ponto facultativo
-- (Pausas). E a ordem da trilha com as 2 etapas novas do parecer (17 etapas).

BEGIN;

-- ─── Limpeza: CR (chr 13) nos textos inseridos em 29/09 ────────────────────
-- Os arquivos de conteúdo foram gravados com quebra de linha do Windows (CRLF)
-- e as quebras dentro dos textos foram para o banco com um CR sobrando.
UPDATE welcome_path_blocos SET conteudo = replace(conteudo, chr(13), '') WHERE position(chr(13) in conteudo) > 0;
UPDATE welcome_path_questoes SET enunciado = replace(enunciado, chr(13), ''), explicacao = replace(explicacao, chr(13), '')
WHERE position(chr(13) in enunciado || coalesce(explicacao, '')) > 0;
UPDATE welcome_path_etapas SET descricao = replace(descricao, chr(13), '') WHERE position(chr(13) in descricao) > 0;

-- ─── Boas-vindas: acessos ─────────────────────────────────────────────────
UPDATE welcome_path_etapas SET descricao = replace(descricao,
  $o$O recado de boas-vindas da King, o seu primeiro mês e um tour pela Home da plataforma.$o$,
  $n$O recado de boas-vindas da King, os seus acessos, o seu primeiro mês e um tour pela Home da plataforma.$n$)
WHERE id = 'da5d27ed-f85c-480d-a6a4-0411e6e8eef6';

INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
SELECT 'da5d27ed-f85c-480d-a6a4-0411e6e8eef6', x.ordem, x.tipo, NULL, x.conteudo, NULL, x.meta::jsonb
FROM (VALUES
  (5, 'h2', $t$Confira os seus acessos$t$, '{}'),
  (6, 'lista', $t$O login da plataforma do professor.
O número de WhatsApp da coordenação, o seu canal com a escola.
O grupo central de avisos da coordenação, no WhatsApp.
O link da plataforma do aluno, que vai no lembrete antes de cada aula.$t$, '{"ordered":false}'),
  (7, 'callout', $t$Assim que é aprovado, você recebe os seus acessos. Faltou algum? Fale com o recrutamento: é ele que libera os acessos dos professores novos.$t$, '{"calloutVariant":"info"}')
) AS x(ordem, tipo, conteudo, meta)
WHERE NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = 'da5d27ed-f85c-480d-a6a4-0411e6e8eef6' AND conteudo = $t$Confira os seus acessos$t$);

-- ─── Primeiro Contato ─────────────────────────────────────────────────────
UPDATE welcome_path_etapas SET descricao =
  $n$Do aceite à primeira aula: o seu Meu Onboarding, a mensagem de apresentação, o aviso à coordenação e o lembrete com a plataforma do aluno.$n$
WHERE id = '3d95ce54-4c6a-45fe-9160-f072d3a6e55f'
  AND descricao = $o$Do aceite à primeira aula: a mensagem de apresentação, a confirmação no grupo e o lembrete de 5 minutos.$o$;

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$Assim que o aluno é adicionado à sua agenda, o contrato aparece na plataforma.$o$,
  $n$Assim que o aluno é adicionado à sua agenda, o contrato aparece na plataforma, na Home, e também chega pelo WhatsApp.$n$)
WHERE id = 'ee27ed23-2d4d-4a30-a0a2-adbac4b47f8e';

-- Seção nova antes do Passo 1: abre 3 posições depois da introdução (ordem 2).
UPDATE welcome_path_blocos SET ordem = ordem + 3
WHERE etapa_id = '3d95ce54-4c6a-45fe-9160-f072d3a6e55f' AND ordem >= 3
  AND NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '3d95ce54-4c6a-45fe-9160-f072d3a6e55f' AND url LIKE '%etapa3-primeiro-contato.html?parte=onboarding');

INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
SELECT '3d95ce54-4c6a-45fe-9160-f072d3a6e55f', x.ordem, x.tipo, NULL, x.conteudo, x.url, x.meta::jsonb
FROM (VALUES
  (3, 'h2', $t$Antes do primeiro aluno – O seu Meu Onboarding$t$, NULL, '{}'),
  (4, 'text', $t$No menu do seu perfil, na plataforma, fica o Meu Onboarding. Assim que um aluno é vinculado à sua agenda, ele pode assistir ao seu vídeo de apresentação, antes mesmo da sua primeira mensagem.

Preencha os seus dados e as suas preferências de ensino e responda às perguntas: como você é em aula, o que curte fora dela, os seus assuntos favoritos, uma curiosidade sobre você e uma mensagem especial ao aluno.

Para gravar: luz de frente, câmera na altura dos olhos, ambiente silencioso, fundo neutro e um aquecimento rápido para soltar a voz. Siga o roteiro: se apresente (5 a 8 segundos), mostre quem você é (10 a 15), conte como você é em aula (10 a 15) e convide o aluno para a primeira aula (10 a 15).$t$, NULL, '{}'),
  (5, 'embed', NULL, '/welcome-path/etapa3-primeiro-contato.html?parte=onboarding', '{"altura":900}')
) AS x(ordem, tipo, conteudo, url, meta)
WHERE NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '3d95ce54-4c6a-45fe-9160-f072d3a6e55f' AND url LIKE '%etapa3-primeiro-contato.html?parte=onboarding');

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$- Realizar o primeiro contato com o aluno de forma rápida e completa;$o$,
  $n$- Preparar o seu Meu Onboarding antes do primeiro aluno;
- Realizar o primeiro contato com o aluno de forma rápida e completa;$n$)
WHERE id = 'de860d4e-1292-4fad-bc7f-c883c7dd9460';

-- ─── Primeira aula ────────────────────────────────────────────────────────
-- O vídeo de boas-vindas (o mesmo da Boas-vindas) estava repetido aqui.
DELETE FROM welcome_path_blocos
WHERE id = 'bfaf41e4-300c-40b7-826d-cb14929e8ae9' AND tipo = 'video';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$O aluno precisa entrar pelo mesmo link, senão vocês ficam em salas diferentes. Se ele não conseguir acessar, envie o link da plataforma do aluno (disponível no MAPA).$o$,
  $n$O aluno precisa entrar pelo mesmo link, senão vocês ficam em salas diferentes. Isso acontece porque os links das aulas são rotativos: mudam a cada aula. Por isso, oriente o aluno a não salvar o link de uma aula, porque na próxima será outro. O caminho certo é sempre a plataforma do aluno, que vai no lembrete. Se, passados 2 minutos do início, ele tiver dificuldade para entrar, mande o link do Meet pelo WhatsApp.$n$)
WHERE id = '870a03d9-83f4-43e4-bf66-62a7818c9b1e';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$A primeira aula é três coisas ao mesmo tempo: nivelar o aluno, conhecer os objetivos dele e dar uma aula de verdade.$o$,
  $n$A primeira aula é três coisas ao mesmo tempo: conhecer o aluno e os objetivos dele, nivelar e dar uma aula de verdade. Comece pelo getting to know each other: com o aluno à vontade, o nivelamento flui melhor.$n$)
WHERE id = 'b783fb33-a1a7-4862-81fb-cbf2b388122e';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$(nivelamento, conhecer o aluno e você se apresentar — didática, tipos de feedback)$o$,
  $n$(conhecer o aluno, você se apresentar — didática, tipos de feedback — e o nivelamento)$n$)
WHERE id = 'e5e8f351-3d76-4b94-85e5-fc3b1a7f195a';

-- Getting to know vira o Passo 4 e o nivelamento, o Passo 5.
UPDATE welcome_path_blocos SET ordem = 12, conteudo = $n$Passo 4 – Conheça o aluno e alinhe expectativas$n$
WHERE id = '87a3bcc5-3026-4d4d-942b-154d3b7620f3';
UPDATE welcome_path_blocos SET ordem = 13, conteudo = replace(conteudo,
  $o$Ainda dentro dos 15 minutos, entenda os objetivos do aluno,$o$,
  $n$Comece pelo getting to know each other, dentro dos 15 minutos: entenda os objetivos do aluno,$n$)
WHERE id = '6cc113f8-44d6-48b9-a19a-bf05629dcb28';
UPDATE welcome_path_blocos SET ordem = 14, conteudo = $n$Passo 5 – Faça o teste de nivelamento (aluno novo na escola)$n$
WHERE id = '0835bf58-3490-4949-ba4a-fd133cabfb4b';
UPDATE welcome_path_blocos SET ordem = 15, conteudo = replace(conteudo,
  $o$Aplique o placement test avaliando$o$,
  $n$Com o aluno já à vontade, aplique o placement test avaliando$n$)
WHERE id = '7ba07fd4-6253-4079-a304-58e10f18594c';
UPDATE welcome_path_blocos SET ordem = 16
WHERE id = 'a06db826-f34b-4b7b-9a9d-a2d3f8c795b9';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$- Compreender que a primeira aula une nivelamento, conhecimento do aluno e aula prática;$o$,
  $n$- Compreender que a primeira aula une conhecer o aluno, nivelamento e aula prática, nessa ordem;$n$)
WHERE id = '0d7960d4-e7fc-4260-af6d-1d3bfebea95e';

UPDATE welcome_path_questoes SET
  opcoes = replace(opcoes::text, $o$Reúne nivelamento, conhecimento dos objetivos do aluno e uma aula prática$o$, $n$Reúne conhecer os objetivos do aluno, o nivelamento e uma aula prática$n$)::jsonb,
  explicacao = replace(explicacao, $o$nivelar, conhecer o aluno e dar aula de verdade$o$, $n$conhecer o aluno, nivelar e dar aula de verdade$n$)
WHERE id = '80cb4ef3-1387-41dc-8e06-7fbb0d8d93b5';

UPDATE welcome_path_questoes SET
  opcoes = replace(opcoes::text, $o$(nivelamento, conhecer o aluno e apresentação)$o$, $n$(conhecer o aluno, apresentação e nivelamento)$n$)::jsonb,
  explicacao = replace(explicacao, $o$— nivelamento, conhecer o aluno e o professor se apresentar —$o$, $n$— conhecer o aluno, o professor se apresentar e o nivelamento —$n$)
WHERE id = '39d45f69-3f5f-4996-88a9-2065f11c98d3';

-- ─── Boas Práticas: critérios de reposição ────────────────────────────────
UPDATE welcome_path_blocos SET ordem = ordem + 1
WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem >= 16
  AND NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND conteudo LIKE 'Aviso com pelo menos 24 horas%');

INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
SELECT '033f205f-fd65-4211-96e6-c82b80dc52a9', 16, 'lista', NULL,
  $t$Aviso com pelo menos 24 horas de antecedência: falta do aluno com direito a reposição.
Aviso em cima da hora ou sem aviso: falta sem direito, com o print da conversa no lançamento.
Motivo nobre sem aviso, como uma emergência de saúde: fica a seu critério. Se abrir a exceção, registre por escrito no WhatsApp.
Limite de 4 faltas com direito por aluno no mês. Da 5ª em diante, a falta é sem direito.
A reposição da falta do aluno vence em 30 dias corridos.
Falta sua: reposição sempre, sem limite e sem prazo.$t$, NULL, '{"ordered":false}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND conteudo LIKE 'Aviso com pelo menos 24 horas%');

-- ─── Etapas novas (desativadas) ───────────────────────────────────────────
UPDATE welcome_path_blocos b SET conteudo = replace(b.conteudo,
  $o$Plataforma do aluno: onde o aluno entra na aula, vê o material e avisa falta.$o$,
  $n$Plataforma do aluno: onde o aluno entra na aula, vê o material, avisa falta e pratica inglês com a Teacher Ju, a inteligência artificial da King, por texto ou áudio.$n$)
FROM welcome_path_etapas e WHERE e.id = b.etapa_id AND e.titulo = 'A King por dentro';

UPDATE welcome_path_blocos b SET conteudo = replace(b.conteudo,
  $o$Personalizar: adapte exemplos e exercícios ao contexto do aluno.$o$,
  $n$Personalizar: adapte exemplos e exercícios ao contexto do aluno. A personalização nasce da conversa: pergunte do que ele gosta, do trabalho, da rotina. Recursos externos gratuitos, como vídeos, jogos e textos, são bem-vindos; conteúdo pago ou de outras escolas, não.$n$)
FROM welcome_path_etapas e WHERE e.id = b.etapa_id AND e.titulo = 'Metodologia King';

UPDATE welcome_path_blocos b SET conteudo = replace(b.conteudo,
  $o$Feedback que só aponta erro desmotiva. Feedback que só elogia não ajuda. O equilíbrio entre reconhecer e direcionar é o que sustenta o engajamento.$o$,
  $n$Organize o feedback em pontos fortes e pontos de melhoria, e fale em "nós": "nós progredimos bem em tal área", "nós precisamos revisar tal conceito". O aprendizado é uma jornada em conjunto, uma parceria entre professor e aluno.

Feedback que só aponta erro desmotiva. Feedback que só elogia não ajuda. O equilíbrio entre reconhecer e direcionar é o que sustenta o engajamento.$n$)
FROM welcome_path_etapas e WHERE e.id = b.etapa_id AND e.titulo = 'Avaliação e troca de nível';

UPDATE welcome_path_blocos b SET conteudo = replace(b.conteudo,
  $o$Corpus Christi, por exemplo, é ponto facultativo.$o$,
  $n$Corpus Christi, por exemplo, é ponto facultativo.

Se o aluno escolher faltar num ponto facultativo, vale o critério de reposição de sempre: com 24 horas ou mais de aviso, tem direito; sem isso, é falta do aluno sem direito a reposição.$n$)
FROM welcome_path_etapas e WHERE e.id = b.etapa_id AND e.titulo = 'Pausas, feriados e fim de ano';

INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT e.id, 4, 'multipla_escolha',
  $t$Num ponto facultativo, a aluna avisa às 17h que vai aproveitar e não fazer a aula das 18h. Como fica?$t$,
  $j$["Sem aula e dia pago, como num feriado nacional.", "Falta com direito a reposição, porque é dia de folga para muita gente.", "Falta da aluna sem direito a reposição: ela avisou com menos de 24 horas.", "Falta do professor."]$j$::jsonb,
  ARRAY[2], $t$Explicação: ponto facultativo tem aula normal. Se o aluno escolhe faltar, vale o critério de reposição de sempre: sem 24 horas de aviso, é falta sem direito, com o print da conversa.$t$
FROM welcome_path_etapas e
WHERE e.titulo = 'Pausas, feriados e fim de ano'
  AND NOT EXISTS (SELECT 1 FROM welcome_path_questoes q WHERE q.etapa_id = e.id AND q.ordem = 4);

-- ─── Ordem da trilha (17 etapas) ──────────────────────────────────────────
WITH alvo(chave, nova_ordem) AS (VALUES
  ('da5d27ed-f85c-480d-a6a4-0411e6e8eef6', 1),   -- Boas-vindas
  ('A King por dentro', 2),
  ('Conhecendo a plataforma', 3),
  ('Sua agenda', 4),
  ('d16d0bd1-faff-44a2-a658-0b3cb10476be', 5),   -- Recebendo alunos
  ('3d95ce54-4c6a-45fe-9160-f072d3a6e55f', 6),   -- Primeiro Contato
  ('f7dd68d3-ad85-4c63-be26-70801611f892', 7),   -- Primeira aula
  ('Em sala', 8),
  ('Lançamento de aulas', 9),
  ('033f205f-fd65-4211-96e6-c82b80dc52a9', 10),  -- Boas Práticas
  ('Metodologia King', 11),
  ('Avaliação e troca de nível', 12),
  ('Seu XP', 13),
  ('7374e623-88ef-4266-8c4d-12e646005e25', 14),  -- Como calcular pagamento
  ('Pausas, feriados e fim de ano', 15),
  ('Aulas experimentais', 16),
  ('b17ff7e4-15c7-4cde-89d9-22f8be0723dc', 17)   -- Encerramento
)
UPDATE welcome_path_etapas e SET ordem = a.nova_ordem
FROM alvo a
WHERE e.id::text = a.chave OR (e.titulo = a.chave AND e.ativa = false);

COMMIT;

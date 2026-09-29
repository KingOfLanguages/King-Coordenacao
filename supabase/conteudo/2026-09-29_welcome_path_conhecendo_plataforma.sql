-- Welcome Path · módulo "Conhecendo a plataforma" (RASCUNHO: ativa = false).
-- Pedido do RH (parecer de 29/09): entre "A King por dentro" e "Sua agenda",
-- para o professor ter o mapa da plataforma antes das etapas que aprofundam
-- cada tela. A posição é aplicada por 2026-09-29_welcome_path_parecer_rh.sql.
-- Fontes: menu da plataforma do professor capturado em 25/09, vídeo
-- "Conhecendo a plataforma" do roteiro do suporte e MAPA 11 a 18.
-- Página de prática: public/welcome-path/conhecendo-plataforma.html.

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Conhecendo a plataforma',
         'O mapa da plataforma do professor: o que tem em cada tela do menu e onde fica cada tarefa do seu dia.',
         false, true, 80, 15
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Conhecendo a plataforma$t$, NULL, '{}'),
    (2, 'text', NULL, $t$A plataforma do professor reúne quase tudo o que você faz na King num lugar só: horários, alunos, lançamentos, reposições, material, oferta de alunos e pagamento. Antes de aprofundar cada tela nas próximas etapas, conheça o mapa.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$O menu da plataforma$t$, NULL, '{}'),
    (4, 'lista', NULL, $t$Home: a sua central do dia, com os avisos da escola, as próximas aulas, o checklist diário, os acessos rápidos, o avanço de nível dos alunos e as reposições.
Agenda do Professor: a sua semana, com os alunos, as reposições e os horários livres, ocupados e de break.
Histórico do Aluno: um card por aluno, com nível, presença do mês, próxima e última aula, as últimas 5 aulas e o botão Trocar nível e liberar material.
Aulas e Reposições › Lançamento de Aulas: os alunos com aula no dia. Lançou, a aula sai da lista; se não lançar, ela vira pendência.
Aulas e Reposições › Reposições: as reposições pendentes e as agendadas. É aqui que você agenda uma reposição.
Materiais: os módulos, com o Now We're Talking por nível, o MAPA e o módulo Primeira aula e nivelamento.
Gestão Professor › Oferta de Alunos: os alunos que a escola oferece. Aqui você aceita ou recusa.
Ranking › Ranking de Ligas: a sua Liga do mês e a sua posição no ranking.
Financeira: o Resumo financeiro do mês, a autorização do pagamento, os dados bancários e a nota fiscal.
Histórico › Histórico de Aulas: as aulas de cada aluno, mês a mês, com o tipo de cada aula.$t$, NULL, '{"ordered":false}'),
    (5, 'text', NULL, $t$No menu do seu perfil, no canto de cima, ficam o Perfil, os Dados bancários e o Meu Onboarding, com o seu vídeo de apresentação para os alunos.$t$, NULL, '{}'),
    (6, 'embed', NULL, NULL, '/welcome-path/conhecendo-plataforma.html?parte=menu', '{"altura":800}'),
    (7, 'callout', NULL, $t$Com pendência de lançamento, a Financeira esconde os seus ganhos do mês até você regularizar. Lance as aulas em dia.$t$, NULL, '{"calloutVariant":"warning"}'),
    (8, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (9, 'lista', NULL, $t$Saber o que tem em cada tela da plataforma do professor.
Encontrar onde lançar, repor, trocar nível, aceitar aluno e conferir o pagamento.
Achar o Meu Onboarding no menu do perfil.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$Onde você troca o nível de um aluno e libera o material dele?$t$,
      $j$["Na Home.", "Em Materiais.", "No Histórico do Aluno.", "Na Financeira."]$j$,
      ARRAY[2], $t$Explicação: no Histórico do Aluno, cada card tem o botão Trocar nível e liberar material. Sem isso, o aluno não acessa o material na plataforma dele.$t$),
  (1, $t$Onde você aceita um aluno que a escola ofereceu?$t$,
      $j$["Na Agenda do Professor.", "Em Gestão Professor › Oferta de Alunos.", "No Histórico de Aulas.", "Em Reposições."]$j$,
      ARRAY[1], $t$Explicação: a Oferta de Alunos, em Gestão Professor, mostra os alunos oferecidos pela escola. É lá que você aceita ou recusa.$t$),
  (2, $t$Onde fica o MAPA, o manual de procedimentos da King?$t$,
      $j$["Em Materiais.", "Na Home.", "Na Financeira.", "No Meu Onboarding."]$j$,
      ARRAY[0], $t$Explicação: o MAPA é um dos módulos de Materiais, junto com o Now We're Talking e o módulo Primeira aula e nivelamento.$t$),
  (3, $t$Você não lançou a aula de ontem. Onde ela está?$t$,
      $j$["Na Agenda do Professor, em vermelho.", "No Histórico de Aulas, lançada como falta.", "Ela some da plataforma.", "Em Aulas e Reposições › Lançamento de Aulas, como pendência."]$j$,
      ARRAY[3], $t$Explicação: aula não lançada em 24 horas vira pendência, em Lançamento de Aulas. Ela tira XP todo dia até você lançar.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

COMMIT;

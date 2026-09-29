-- Welcome Path 2.0 · Fase 2 · módulo "Avaliação e troca de nível" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição e a hora de ativar. Só aplicar DEPOIS do deploy de
-- public/welcome-path/avaliacao-nivel.html (os 2 blocos embed apontam para ela).
-- Fontes: MAPA 9 (avaliações no Now We're Talking), MAPA 0 seção 6 (feedback),
-- MAPA 13 (Perfil dos Alunos) e guia de XP. Decisões do João em 29/09: as provas
-- fazem parte do Now We're Talking; a avaliação é contínua (quem vai bem em todas
-- as Evaluations está pronto para passar de nível; a prova de 70 pontos e as 2
-- retentativas do MAPA 0 eram do modelo antigo); o material vai de A1 a C2.

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Avaliação e troca de nível',
         'A Evaluation a cada 12 aulas do Now We''re Talking, o feedback ao aluno e como trocar o nível e liberar o material.',
         false, true, 80, 20
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Avaliação e troca de nível$t$, NULL, '{}'),
    (2, 'text', NULL, $t$Com o Now We're Talking, a avaliação mudou: o foco agora é a comunicação real do aluno durante a aula, e não provas de alternativa. As avaliações fazem parte do próprio material.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – A Evaluation$t$, NULL, '{}'),
    (4, 'text', NULL, $t$A cada 12 aulas, aparece sozinha no material uma aula chamada Evaluation: aula 13, 26, 39 e assim por diante. Nela você encontra perguntas sobre os conteúdos das 12 aulas anteriores.

A avaliação acontece dentro da própria aula, de forma natural e prática. Você observa:

- a compreensão;
- o desenvolvimento da fala;
- o vocabulário;
- a comunicação;
- a confiança ao responder;
- a evolução geral do aluno.

É também o momento de conversar com o aluno sobre o que evoluiu, o que ainda gera dificuldade, o que precisa de mais prática e quais objetivos fazem sentido para o próximo ciclo. Assim a avaliação vira desenvolvimento e alinhamento, e não só correção.

A avaliação é contínua: não existe mais uma prova final para passar de nível. Se o aluno vai bem em todas as Evaluations do livro, ele está pronto para o próximo nível.$t$, NULL, '{}'),
    (5, 'h2', NULL, $t$2 – O feedback$t$, NULL, '{}'),
    (6, 'text', NULL, $t$A Evaluation é o momento mais direto de conexão pedagógica com o aluno. Use-a para:

- reconhecer o progresso, mesmo que seja pequeno;
- apontar o que precisa de atenção, de forma clara e construtiva;
- ajustar o plano das próximas aulas às dificuldades dele;
- alinhar expectativas: o aluno precisa entender onde está e para onde vai.

Feedback que só aponta erro desmotiva. Feedback que só elogia não ajuda. O equilíbrio entre reconhecer e direcionar é o que sustenta o engajamento.$t$, NULL, '{}'),
    (7, 'embed', NULL, NULL, '/welcome-path/avaliacao-nivel.html?parte=evaluation', '{"altura":2060}'),
    (8, 'h2', NULL, $t$3 – Troca de nível e liberação de material$t$, NULL, '{}'),
    (9, 'text', NULL, $t$É uma das tarefas mais importantes do seu dia a dia. No Perfil dos Alunos, clique em "Trocar nível e liberar material", escolha a origem do material, o nível atual do aluno e o módulo em que ele está, e salve. O material fica disponível para o aluno automaticamente.$t$, NULL, '{}'),
    (10, 'callout', NULL, $t$Sem essa configuração, o aluno não consegue acessar o material na plataforma dele. Atualize sempre que houver troca de nível ou início de um novo módulo.$t$, NULL, '{"calloutVariant":"warning"}'),
    (11, 'embed', NULL, NULL, '/welcome-path/avaliacao-nivel.html?parte=nivel', '{"altura":1100}'),
    (12, 'text', NULL, $t$Isso também conta no seu XP: atualizar o material do aluno vale +20 e cada avanço de nível do aluno vale +150, os dois no máximo uma vez a cada 90 dias por aluno. Voltar o aluno para um nível anterior não tira XP.$t$, NULL, '{}'),
    (13, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (14, 'lista', NULL, $t$Reconhecer a Evaluation a cada 12 aulas do Now We're Talking.
Saber que a avaliação é contínua: quem vai bem em todas as Evaluations está pronto para passar de nível.
Conduzir a Evaluation como conversa, observando o uso real do inglês.
Dar um feedback que reconhece o progresso e aponta o que precisa de atenção.
Trocar o nível e liberar o material do aluno no Perfil dos Alunos.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$No Now We're Talking, a cada quantas aulas aparece uma Evaluation?$t$,
      $j$["A cada 6 aulas.", "A cada 12 aulas: aula 13, 26, 39…", "Só no fim do livro.", "Quando o professor quiser."]$j$,
      ARRAY[1], $t$Explicação: a cada 12 aulas, o material traz sozinho uma Evaluation, com perguntas sobre as 12 aulas anteriores.$t$),
  (1, $t$O que a Evaluation observa?$t$,
      $j$["Quantas alternativas o aluno acerta.", "Só a gramática.", "Compreensão, fala, vocabulário, comunicação, confiança e evolução do aluno.", "Se o aluno terminou o livro."]$j$,
      ARRAY[2], $t$Explicação: o foco deixou de ser acertar alternativas e passou a ser o uso real do inglês em conversa.$t$),
  (2, $t$Qual feedback segue o jeito King?$t$,
      $j$["Reconhecer o que evoluiu, apontar com clareza o que precisa de atenção e ajustar as próximas aulas.", "Listar todos os erros para o aluno não repetir.", "Só elogiar, para manter o aluno motivado.", "Não dar feedback, para não constranger."]$j$,
      ARRAY[0], $t$Explicação: feedback que só aponta erro desmotiva, e feedback que só elogia não ajuda. O equilíbrio entre reconhecer e direcionar sustenta o engajamento.$t$),
  (3, $t$Por que configurar "Trocar nível e liberar material" no Perfil dos Alunos?$t$,
      $j$["Para a coordenação saber o nível do aluno.", "Para gerar a nota do aluno.", "Porque só assim você recebe pela aula.", "Porque, sem isso, o aluno não consegue acessar o material na plataforma dele."]$j$,
      ARRAY[3], $t$Explicação: é o nível e o módulo salvos que liberam o material para o aluno. Atualize sempre que houver troca de nível ou início de novo módulo.$t$),
  (4, $t$No Now We're Talking, quando o aluno está pronto para passar de nível?$t$,
      $j$["Quando tira 70 pontos numa prova final do livro.", "Quando completa um ano de aulas.", "Quando vai bem em todas as Evaluations do livro.", "Quando a coordenação decide."]$j$,
      ARRAY[2], $t$Explicação: a avaliação é contínua. Cada Evaluation, a cada 12 aulas, mostra como o aluno está; indo bem em todas, ele está pronto para o próximo nível. A prova de 70 pontos era do modelo antigo.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'Avaliação e troca de nível';

COMMIT;

-- Welcome Path 2.0 · Fase 2 · módulo "Aulas experimentais" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição e a hora de ativar. Só aplicar DEPOIS do deploy de
-- public/welcome-path/aulas-experimentais.html (os 3 blocos embed apontam para ela).
-- Fontes: MAPA 4 e vídeo 11 do roteiro. Decisão de 29/09: não existe mais
-- material próprio de experimental; usa-se uma aula do Now We're Talking. O link
-- do Drive do MAPA 4 ficou de fora (material aposentado).

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Aulas experimentais',
         'A aula avulsa de 30 minutos para quem ainda não conhece a King: como ela chega até você, como dar a aula e como receber.',
         false, true, 80, 15
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Aulas experimentais$t$, NULL, '{}'),
    (2, 'text', NULL, $t$A aula experimental é uma ótima oportunidade de conquistar alunos novos para a escola, e também de ganhar um extra no fim do mês.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – O que é a experimental$t$, NULL, '{}'),
    (4, 'text', NULL, $t$É uma aula avulsa de 30 minutos, fora da tabela de planos, para quem se interessou pela King mas ainda não conhece a dinâmica das aulas.

O objetivo é dar a aula e encantar: mostrar a experiência de ser aluno King, com uma aula leve, focada em conversação e no ritmo do aluno. Foque em dar a aula, não em vender.$t$, NULL, '{}'),
    (5, 'h2', NULL, $t$2 – Como a experimental chega até você$t$, NULL, '{}'),
    (6, 'text', NULL, $t$Quem convida é o time de vendas. O vendedor pode procurar você direto, conforme a sua disponibilidade na agenda, ou oferecer a aula no grupo da coordenação. Se quiser assumir, responda no privado do vendedor.

Diferente dos alunos regulares, na experimental quem fala com o aluno é o vendedor. Você manda o link da aula para ele e está presente no dia e horário combinados.

A experimental aparece na sua agenda. Só o vendedor que agendou ou a coordenação podem tirá-la. Se houver qualquer problema, fale com quem agendou e com a coordenação.$t$, NULL, '{}'),
    (7, 'embed', NULL, NULL, '/welcome-path/aulas-experimentais.html?parte=quem', '{"altura":1200}'),
    (8, 'h2', NULL, $t$3 – Os 30 minutos$t$, NULL, '{}'),
    (9, 'lista', NULL, $t$Você se apresenta: nome, de onde fala e por que dá aula de inglês (cerca de 2 minutos).
O aluno se apresenta em inglês: nome, de onde fala e por que quer aprender. É aqui que você sente o nível de comunicação dele (3 a 5 minutos).
A história dele com o inglês e o que ele espera das aulas (3 a 5 minutos).
Uma atividade dinâmica, com o aluno falando em inglês, no tempo que sobra.$t$, NULL, '{"ordered":true}'),
    (10, 'text', NULL, $t$Não existe mais um material próprio de experimental. Use uma aula do Now We're Talking, em Materiais, escolhida pelo nível aproximado que o vendedor passar.

O aluno precisa sair da experimental tendo aprendido algo novo. E respeite os 30 minutos.$t$, NULL, '{}'),
    (11, 'embed', NULL, NULL, '/welcome-path/aulas-experimentais.html?parte=roteiro', '{"altura":640}'),
    (12, 'callout', NULL, $t$Não explique valores, pacotes ou contrato, e não tente vender o curso. Se o aluno perguntar, diga que o vendedor tira todas as dúvidas depois da aula.$t$, NULL, '{"calloutVariant":"warning"}'),
    (13, 'h2', NULL, $t$4 – Lançamento e pagamento$t$, NULL, '{}'),
    (14, 'text', NULL, $t$Quem lança a experimental na plataforma é o vendedor que agendou, e ele tem até o fim do mês para isso. Não é função sua.

A experimental é remunerada, à parte do plano dos seus alunos. Guarde o nome do aluno, o nome do vendedor, o dia e o horário da aula. Se ela não aparecer até o dia do pagamento, fale com quem agendou e peça o lançamento.$t$, NULL, '{}'),
    (15, 'embed', NULL, NULL, '/welcome-path/aulas-experimentais.html?parte=situacoes', '{"altura":1550}'),
    (16, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (17, 'lista', NULL, $t$Entender que a experimental é para dar a aula e encantar, não para vender.
Saber como aceitar uma experimental e o que fica com você e com o vendedor.
Conduzir os 30 minutos com uma aula do Now We're Talking.
Guardar os dados da aula e pedir o lançamento a quem agendou, se preciso.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$Durante a experimental, o aluno pergunta quanto custa o curso. O que você faz?$t$,
      $j$["Explica os planos e os valores.", "Diz que o vendedor tira todas as dúvidas depois da aula e segue com a atividade.", "Oferece um desconto para ele fechar logo.", "Pede para ele ligar para a coordenação."]$j$,
      ARRAY[1], $t$Explicação: valores, pacotes e contrato ficam com o vendedor. O seu foco é dar a aula.$t$),
  (1, $t$Quem lança a aula experimental na plataforma?$t$,
      $j$["Você, no mesmo dia.", "A coordenação.", "O aluno, pela plataforma dele.", "O vendedor que agendou a aula."]$j$,
      ARRAY[3], $t$Explicação: quem lança é o vendedor que agendou, até o fim do mês. Se a aula não aparecer até o pagamento, peça o lançamento a ele.$t$),
  (2, $t$Qual material usar na aula experimental?$t$,
      $j$["Uma aula do Now We're Talking, escolhida pelo nível aproximado que o vendedor passar.", "O material de experimental do Kit Professor.", "Um material de outra escola.", "Nenhum: a experimental é só conversa."]$j$,
      ARRAY[0], $t$Explicação: o material próprio de experimental não é mais usado. A aula vem do Now We're Talking, em Materiais, e o aluno precisa sair tendo aprendido algo novo.$t$),
  (3, $t$Quanto dura a aula experimental?$t$,
      $j$["15 minutos.", "45 minutos.", "30 minutos.", "O tempo que o aluno quiser."]$j$,
      ARRAY[2], $t$Explicação: a experimental tem 30 minutos. Respeite a duração, mesmo que a aula esteja indo muito bem.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'Aulas experimentais';

COMMIT;

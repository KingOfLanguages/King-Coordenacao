-- Welcome Path 2.0 · Fase 1 · módulo "Sua agenda" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição e a hora de ativar. Só aplicar DEPOIS do deploy de
-- public/welcome-path/sua-agenda.html (os 3 blocos embed apontam para ela).
-- Regras: MAPA 12 (Agenda do Professor), 1, 15 e 17; KMS atual (o break não pede data).

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Sua agenda',
         'Como a agenda decide quando chega aluno: fechar horários, break, troca de dia de aluno e reposição num horário fechado.',
         false, true, 80, 25
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Sua agenda$t$, NULL, '{}'),
    (2, 'text', NULL, $t$A agenda é o reflexo da sua disponibilidade. É por ela que a King coloca alunos novos para você, é nela que você entra nas aulas e é nela que você mostra quando não pode dar aula. Agenda bem cuidada traz aluno; agenda descuidada traz aluno num horário em que você não pode.

As práticas desta etapa reproduzem a Agenda do Professor, com alunos fictícios. Nada do que você faz nelas chega ao sistema real.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – Horário livre recebe aluno$t$, NULL, '{}'),
    (4, 'text', NULL, $t$Toda célula que fica livre pode receber um aluno novo. Se você não pode dar aula num horário, marque-o como Horário ocupado.

Das 6h às 9h e das 17h às 23h ficam os horários de alta demanda: é neles que mais chega aluno. Antes de fechar um deles, o KMS pergunta se você tem certeza.$t$, NULL, '{}'),
    (5, 'callout', NULL, $t$Sempre que mudar algo na agenda, clique em Salvar alterações, o botão azul no alto da agenda. Sem isso, nada muda.$t$, NULL, '{"calloutVariant":"warning"}'),
    (6, 'embed', NULL, NULL, '/welcome-path/sua-agenda.html?parte=horarios', '{"altura":1450}'),
    (7, 'h2', NULL, $t$2 – Os tipos de agendamento$t$, NULL, '{}'),
    (8, 'lista', NULL, $t$Sem aula: o horário fica livre para receber aluno novo.
Aula normal: muda o dia de aula de um aluno individual.
Turma: muda o dia de aula de uma dupla ou trio.
Horário ocupado: fecha um horário em que você não pode dar aula.
Break personalizado: um intervalo seu, que pode valer para vários horários do mesmo dia.$t$, NULL, '{"ordered":false}'),
    (9, 'h2', NULL, $t$3 – Mexendo nos seus alunos$t$, NULL, '{}'),
    (10, 'text', NULL, $t$Para trocar o dia de um aluno, arraste a célula dele para o novo horário ou use o lápis dentro da célula. A troca vale a partir da semana seguinte: nesta semana, a aula continua no horário antigo. Sempre que mexer no horário de um aluno, avise a coordenação.

A legenda embaixo da grade diz o que é cada cor: verde é aula, amarelo é reposição, roxo é turma, rosa é aluno em pausa, vermelho é horário reservado para um aluno que ainda vai começar, laranja é transferência, cinza claro é break e cinza escuro é horário ocupado.

O botão Verificar Faltas mostra os alunos que avisaram, pela plataforma deles, que vão faltar nos próximos 7 dias. Confira antes das aulas da semana.$t$, NULL, '{}'),
    (11, 'embed', NULL, NULL, '/welcome-path/sua-agenda.html?parte=alunos', '{"altura":1450}'),
    (12, 'h2', NULL, $t$4 – Reposição num horário fechado$t$, NULL, '{}'),
    (13, 'text', NULL, $t$A reposição só pode ser agendada num horário livre. Se o único horário possível está fechado, abra-o como Sem aula, agende a reposição e, depois que ela acontecer, feche o horário de novo como Horário ocupado.

Reposição nunca vira extensão da aula regular: ela acontece num horário próprio.$t$, NULL, '{}'),
    (14, 'embed', NULL, NULL, '/welcome-path/sua-agenda.html?parte=reposicao', '{"altura":1450}'),
    (15, 'h2', NULL, $t$5 – Agenda travada$t$, NULL, '{}'),
    (16, 'text', NULL, $t$No alto da agenda aparece se ela está travada ou destravada. Ela trava com pendências de lançamento acumuladas, quando você nega um contrato, quando falta à primeira aula de um aluno ou a pedido seu numa emergência. Travada, a agenda não recebe alunos novos e só aceita Horário ocupado e Break. Quem destrava é a coordenação.$t$, NULL, '{}'),
    (17, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (18, 'lista', NULL, $t$Entender que horário livre recebe aluno novo e fechar o que você não pode.
Usar os tipos de agendamento e salvar as alterações.
Trocar o dia de um aluno sabendo que vale a partir da semana seguinte, e avisar a coordenação.
Ler a legenda de cores e o Verificar Faltas.
Usar um horário fechado para reposição sem deixá-lo aberto depois.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$Você não pode dar aula às quintas das 19h às 21h. O que fazer na agenda?$t$,
      $j$["Deixar livre e recusar se chegar aluno.", "Marcar esses horários como Horário ocupado e salvar.", "Deixar livre e avisar a coordenação por WhatsApp.", "Criar uma aula normal com um aluno qualquer para bloquear."]$j$,
      ARRAY[1], $t$Explicação: horário livre recebe aluno novo. O que você não pode, feche como Horário ocupado e salve. Recusar um contrato que caiu na agenda trava a agenda.$t$),
  (1, $t$A Ana pediu para trocar a aula de segunda para quarta. Você fez a troca e salvou numa terça. Quando a troca começa a valer?$t$,
      $j$["Na hora: a quarta desta semana já é o novo horário.", "A partir da próxima semana. Nesta semana a aula continua na segunda.", "Só depois que a coordenação aprovar.", "Só depois que a aluna confirmar pela plataforma dela."]$j$,
      ARRAY[1], $t$Explicação: a troca de dia de um aluno vale a partir da semana seguinte, e o KMS avisa isso ao salvar. Sempre que mexer no horário de um aluno, avise a coordenação.$t$),
  (2, $t$O único horário em que o aluno pode repor a aula está fechado na sua agenda. O que fazer?$t$,
      $j$["Repor logo depois da aula regular dele, estendendo a aula.", "Dizer ao aluno que não há horário e deixar a reposição vencer.", "Abrir o horário como Sem aula, agendar a reposição e fechar de novo depois que ela acontecer.", "Deixar o horário aberto de vez, para facilitar as próximas reposições."]$j$,
      ARRAY[2], $t$Explicação: a reposição precisa de horário livre. Abra o horário só para ela e, depois, volte a célula para Horário ocupado. Reposição nunca vira extensão da aula regular.$t$),
  (3, $t$Na sua agenda aparece uma célula vermelha com o nome de um aluno que você ainda não conhece. O que ela indica?$t$,
      $j$["Um aluno que faltou e tem reposição.", "Um horário bloqueado pela coordenação.", "Um aluno novo reservado para você, que começa na data prevista.", "Um aluno transferido para outro professor."]$j$,
      ARRAY[2], $t$Explicação: vermelho é horário reservado. O aluno já é seu e começa na previsão de início; o horário não está livre. Reposição é amarelo, horário ocupado é cinza escuro e transferência é laranja.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'Sua agenda';

COMMIT;

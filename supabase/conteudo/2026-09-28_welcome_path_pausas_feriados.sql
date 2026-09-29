-- Welcome Path 2.0 · Fase 2 · módulo "Pausas, feriados e fim de ano" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição e a hora de ativar (tem prazo: antes de dezembro,
-- por causa da pausa de fim de ano). Só aplicar DEPOIS do deploy de
-- public/welcome-path/etapa-pausas-feriados.html (os 3 blocos embed apontam para ela).
-- Regras: MAPA 8 (Feriados e pausas); feriado nacional = falta do aluno sem
-- reposição, observação "Feriado nacional" e print do aviso (decisão de 24/09);
-- pausa do aluno: Suporte ao Aluno + coordenação pelo WhatsApp (25/09); pausa do
-- professor pelo formulário de pausa (motivo, último dia de aula, fim previsto).

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Pausas, feriados e fim de ano',
         'Quando não tem aula, como lançar o feriado e o caminho de cada pausa: a do aluno, a sua e a de fim de ano.',
         false, true, 80, 20
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Pausas, feriados e fim de ano$t$, NULL, '{}'),
    (2, 'text', NULL, $t$Ao longo do ano, alguns dias não têm aula, e às vezes o aluno ou você vão precisar parar. Esta etapa mostra o que fazer em cada caso: feriado, pausa do aluno, a sua pausa e a pausa de fim de ano.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – Feriados$t$, NULL, '{}'),
    (4, 'text', NULL, $t$A King só para em feriado nacional. Nesses dias não tem aula, e o dia é pago.

Ponto facultativo, feriado estadual e feriado municipal têm aula normal: seus alunos podem ser de qualquer cidade do país. Corpus Christi, por exemplo, é ponto facultativo.$t$, NULL, '{}'),
    (5, 'embed', NULL, NULL, '/welcome-path/etapa-pausas-feriados.html?parte=feriados', '{"altura":1200}'),
    (6, 'h2', NULL, $t$2 – Lançando as aulas do feriado$t$, NULL, '{}'),
    (7, 'text', NULL, $t$As aulas do feriado também são lançadas. Sem lançamento, viram pendência: tiram XP todo dia e, acumuladas, travam a agenda.

Lance cada aula como Falta do Aluno, sem reposição, com a observação "Feriado nacional", e anexe o print da mensagem em que você avisou o aluno do feriado.$t$, NULL, '{}'),
    (8, 'callout', NULL, $t$Avise seus alunos do feriado com antecedência. O print desse aviso é o que você anexa no lançamento.$t$, NULL, '{"calloutVariant":"warning"}'),
    (9, 'embed', NULL, NULL, '/welcome-path/etapa-pausas-feriados.html?parte=lancar', '{"altura":640}'),
    (10, 'h2', NULL, $t$3 – Pausas$t$, NULL, '{}'),
    (11, 'text', NULL, $t$Pausa do aluno: se o aluno precisar ficar mais de uma semana sem aula, peça que ele fale com o Suporte ao Aluno e avise a coordenação pelo WhatsApp. Menos que isso segue a regra de 4 reposições no mês.

A sua pausa: fale com a coordenação e preencha o formulário de pausa, com o motivo, o último dia de aula e o fim previsto. A sua agenda é bloqueada para alunos novos, seus alunos são passados para outros professores antes do início, e você recebe por todas as aulas dadas até lá. No fim previsto, a coordenação procura você para reabrir a agenda.

Saúde e imprevistos: avise os alunos e a coordenação com antecedência. O aluno não pode ficar esperando na chamada. Se o afastamento for maior, alinhe com o seu coordenador a data e o caminho.$t$, NULL, '{}'),
    (12, 'h2', NULL, $t$4 – Pausa de fim de ano$t$, NULL, '{}'),
    (13, 'text', NULL, $t$Todo ano você escolhe se adere à pausa de fim de ano da escola. Ela vai da semana do Natal até 2 de janeiro.

Quem adere não dá aula nesse período e recebe por todas as aulas dadas até o início da pausa. Na volta, os alunos retornam aos poucos: a escola não garante os mesmos alunos nem a mesma quantidade de aulas, porque alguns cancelam, pausam ou ficam com outro professor. A escola segue mandando alunos novos para os seus horários livres.$t$, NULL, '{}'),
    (14, 'embed', NULL, NULL, '/welcome-path/etapa-pausas-feriados.html?parte=pausas', '{"altura":1400}'),
    (15, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (16, 'lista', NULL, $t$Saber em que dias tem aula: a King só para em feriado nacional.
Lançar as aulas do feriado como falta do aluno sem reposição, com a observação e o print.
Encaminhar a pausa longa do aluno para o Suporte ao Aluno e avisar a coordenação.
Pedir a sua pausa pelo formulário, com o motivo, o último dia de aula e o fim previsto.
Decidir sobre a pausa de fim de ano sabendo o que acontece com os alunos.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$O 15 de novembro, Proclamação da República, caiu numa terça. Tem aula?$t$,
      $j$["Sim: é ponto facultativo.", "Não: é feriado nacional, e o dia é pago.", "Depende da cidade de cada aluno.", "Só se o aluno pedir."]$j$,
      ARRAY[1], $t$Explicação: o 15 de novembro é feriado nacional. A King não dá aula em feriado nacional, e o dia é pago. Ponto facultativo, feriado estadual e municipal têm aula normal.$t$),
  (1, $t$Como lançar uma aula que caiu num feriado nacional?$t$,
      $j$["Falta do professor, com reposição.", "Não lançar, porque não houve aula.", "Falta do aluno sem reposição, com a observação \"Feriado nacional\" e o print do aviso ao aluno.", "Falta do aluno com reposição."]$j$,
      ARRAY[2], $t$Explicação: feriado nacional é lançado como falta do aluno sem reposição, com a observação "Feriado nacional" e o print da mensagem em que você avisou o aluno. Aula sem lançamento vira pendência.$t$),
  (2, $t$Um aluno vai ficar duas semanas sem aula. O que fazer?$t$,
      $j$["Pedir que ele fale com o Suporte ao Aluno e avisar a coordenação pelo WhatsApp.", "Lançar falta com direito a reposição em todas as aulas.", "Combinar com ele de repor tudo na volta.", "Tirar o aluno da sua agenda."]$j$,
      ARRAY[0], $t$Explicação: mais de uma semana sem aula é pausa. Quem cuida é o Suporte ao Aluno, e a coordenação precisa saber. Menos que isso segue a regra de 4 reposições no mês.$t$),
  (3, $t$Você decidiu aderir à pausa de fim de ano. O que acontece?$t$,
      $j$["Você recebe dezembro inteiro, como se tivesse dado aula.", "Os seus alunos ficam guardados e voltam todos em janeiro.", "A pausa é obrigatória para todos os professores.", "Você recebe pelas aulas dadas até o início da pausa, e parte dos alunos pode não voltar."]$j$,
      ARRAY[3], $t$Explicação: a adesão é escolha sua. Você recebe pelas aulas dadas até o início da pausa, que vai da semana do Natal até 2 de janeiro. Na volta os alunos retornam aos poucos, e a escola segue mandando alunos novos para os horários livres.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'Pausas, feriados e fim de ano';

COMMIT;

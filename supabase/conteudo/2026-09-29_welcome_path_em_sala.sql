-- Welcome Path 2.0 · Fase 2 · módulo "Em sala" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição e a hora de ativar. Só aplicar DEPOIS do deploy de
-- public/welcome-path/em-sala.html (os 3 blocos embed apontam para ela).
-- Fontes: MAPA 0 (comunicação e conduta em aula), MAPA 3 seções 6 a 8 e vídeos
-- 15 e 20. Decisões do João em 29/09: o link do Meet não vai antes da aula, só o
-- da plataforma do aluno; passados 2 minutos do início, se o aluno não entrou ou
-- tem dificuldade, o professor manda o link do Meet; a espera é de 15 minutos;
-- contato com a coordenação é pelo WhatsApp dela.

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Em sala',
         'O que fazer do lembrete ao fim da aula: aluno que não entra, a regra dos 15 minutos, atraso, aluno sumido e por que deixar tudo registrado.',
         false, true, 80, 25
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Em sala$t$, NULL, '{}'),
    (2, 'text', NULL, $t$Toda aula começa com um compromisso seu: estar na chamada no horário e disponível para o aluno, mesmo quando ele atrasa ou não aparece. Esta etapa mostra o que fazer em cada momento, do lembrete ao lançamento.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – Antes e no começo da aula$t$, NULL, '{}'),
    (4, 'text', NULL, $t$Cinco minutos antes de toda aula, mande ao aluno o lembrete com o link da plataforma do aluno. É por ela que ele entra na aula. Mande com intenção: lembrar o que vocês vão trabalhar mostra que você se preparou para ele.

Não mande o link do Meet antes da aula. Entre na chamada no horário. Se, passados 2 minutos do início, o aluno não entrou ou tem dificuldade para entrar, mande o link do Meet pelo WhatsApp e siga na chamada.$t$, NULL, '{}'),
    (5, 'h2', NULL, $t$2 – A regra dos 15 minutos$t$, NULL, '{}'),
    (6, 'text', NULL, $t$Aguarde o aluno na chamada por pelo menos 15 minutos. Se, passado esse tempo, não houver nenhum retorno por mensagem nem pedido de entrada, você está liberado para sair.

Sair da chamada não encerra a aula. O aluno sempre tem direito ao tempo que resta: se ele mandar mensagem ou pedir para entrar ainda dentro do horário, volte e conduza normalmente o tempo que sobrar.

O atraso não estica a aula. Se o atraso foi do aluno, a aula termina no horário de sempre: ele tem direito ao tempo restante, não a uma aula cheia depois do horário.$t$, NULL, '{}'),
    (7, 'embed', NULL, NULL, '/welcome-path/em-sala.html?parte=chamada', '{"altura":2250}'),
    (8, 'h2', NULL, $t$3 – O aluno sumiu$t$, NULL, '{}'),
    (9, 'text', NULL, $t$Faltas frequentes e atrasos seguidos são sinais de que algo mudou na rotina do aluno. Converse com ele e avise a coordenação: agir cedo aumenta a chance de manter o aluno.

Se o aluno faltar 3 dias úteis seguidos sem retorno, continue entrando na chamada no horário das aulas e esperando pelo menos 15 minutos, como faria com qualquer aluno que está faltando. Siga mandando o link no horário, mantenha o contato e avise a coordenação pelo WhatsApp dela. Acompanhe até o aluno voltar ou ser retirado da sua agenda.$t$, NULL, '{}'),
    (10, 'callout', NULL, $t$Registrar presença ou manter ativo um aluno que você sabe que sumiu, para continuar recebendo, é lançamento deliberadamente incorreto. Como todo lançamento feito errado de propósito, é motivo para o encerramento da parceria.$t$, NULL, '{"calloutVariant":"danger"}'),
    (11, 'embed', NULL, NULL, '/welcome-path/em-sala.html?parte=sumido', '{"altura":1150}'),
    (12, 'h2', NULL, $t$4 – Deixe registrado$t$, NULL, '{}'),
    (13, 'text', NULL, $t$Como prestadores de serviço, o ônus da prova é sempre nosso. O WhatsApp é o canal oficial para o que é importante: agendamento de reposição, confirmação de aula e avisos precisam estar lá, por escrito. Combinado só falado não vale como registro. Se o aluno não responder, o print da sua tentativa de contato já conta.

Não basta estar na chamada. Em qualquer desencontro, como você num link e o aluno em outro, tente contato na hora, guarde o registro e avise a coordenação. Se o aluno questionar uma falta depois, são essas mensagens que mostram que você estava lá e fez a sua parte.$t$, NULL, '{}'),
    (14, 'embed', NULL, NULL, '/welcome-path/em-sala.html?parte=registro', '{"altura":1000}'),
    (15, 'h2', NULL, $t$5 – Cuidados em aula$t$, NULL, '{}'),
    (16, 'lista', NULL, $t$Pontualidade: entre na chamada no horário, sempre.
Câmera ligada, fundo limpo e um ambiente tranquilo e organizado.
Uma garrafinha de água por perto.
Você não precisa contar aos alunos que está começando agora na escola.$t$, NULL, '{"ordered":false}'),
    (17, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (18, 'lista', NULL, $t$Mandar o lembrete com a plataforma do aluno e, se preciso, o link do Meet depois de 2 minutos.
Aplicar a regra dos 15 minutos sem encerrar a aula antes da hora.
Terminar a aula no horário, mesmo com atraso do aluno.
Acompanhar o aluno sumido com transparência, sem lançar presença que não houve.
Deixar registrado no WhatsApp tudo o que é importante.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$A aula começou às 19h e, às 19h02, o aluno ainda não entrou. O que fazer?$t$,
      $j$["Esperar até 19h15 antes de qualquer coisa.", "Mandar o link do Meet pelo WhatsApp e seguir na chamada.", "Sair da chamada e lançar falta.", "Ligar para a coordenação."]$j$,
      ARRAY[1], $t$Explicação: passados 2 minutos do início, se o aluno não entrou ou tem dificuldade, o link do Meet vai pelo WhatsApp. A mensagem também fica como registro da sua tentativa.$t$),
  (1, $t$O aluno não apareceu e não respondeu. Quanto tempo você espera na chamada?$t$,
      $j$["5 minutos.", "10 minutos.", "Até o fim da aula, sem sair.", "Pelo menos 15 minutos; depois pode sair, mas ele ainda tem direito ao tempo que resta."]$j$,
      ARRAY[3], $t$Explicação: depois de 15 minutos sem retorno você está liberado para sair. Mas sair não encerra a aula: se ele pedir para entrar dentro do horário, você volta.$t$),
  (2, $t$A aula vai das 19h às 19h30. O aluno entra às 19h20. Até quando vai a aula?$t$,
      $j$["Até 19h30.", "Até 19h50, para ele ter a aula completa.", "Até 19h40, metade do tempo perdido.", "A aula não acontece, porque passaram os 15 minutos."]$j$,
      ARRAY[0], $t$Explicação: o atraso não estica a aula. O aluno tem direito ao tempo que resta, e a aula termina no horário de sempre.$t$),
  (3, $t$Um aluno falta há 3 dias úteis seguidos e não responde. Qual conduta está certa?$t$,
      $j$["Lançar presença até ele voltar, para não perder o valor.", "Parar de entrar nas aulas até ele responder.", "Seguir entrando nas aulas e esperando 15 minutos, manter o contato e avisar a coordenação.", "Tirar o aluno da sua agenda."]$j$,
      ARRAY[2], $t$Explicação: você segue comparecendo e tentando contato, e avisa a coordenação. Lançar presença para quem sumiu é lançamento deliberadamente incorreto e motivo para encerrar a parceria.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'Em sala';

COMMIT;

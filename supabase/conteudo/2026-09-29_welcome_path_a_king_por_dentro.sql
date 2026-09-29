-- Welcome Path 2.0 · Fase 1 · módulo "A King por dentro" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição (a proposta põe logo depois de Boas-vindas) e a hora
-- de ativar. Só aplicar DEPOIS do deploy de public/welcome-path/a-king-por-dentro.html
-- (os 4 blocos embed apontam para ela).
-- Fontes: MAPA 0 (metodologia e Masterclass), MAPA 19 (Nossos times), MAPA 21
-- (plataforma do aluno), vídeos 1, 2, 3, 4, 5 e 10 do roteiro do suporte; o Kit
-- Professor deixou de existir (28/09). Sem telefone nem link real: a coordenação
-- põe o número e o link da Masterclass no editor, se quiser.
-- Decisão de 29/09: o grupo onde se confirmava o primeiro contato e o "grupo com
-- seu nome" não existem mais; todo contato com a coordenação é pelo WhatsApp dela.

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'A King por dentro',
         'O que a King quer com cada aula, o caminho do aluno até você, quem faz o quê e onde pedir ajuda.',
         false, true, 80, 20
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – A King por dentro$t$, NULL, '{}'),
    (2, 'text', NULL, $t$Antes do primeiro aluno, vale conhecer a escola por dentro: o que a King quer com cada aula, o caminho que o aluno faz até chegar a você, quem faz o quê e onde pedir ajuda.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – O que a King quer com cada aula$t$, NULL, '{}'),
    (4, 'text', NULL, $t$O propósito da King é conectar pessoas, culturas e possibilidades. Aqui, cada aula é particular, com foco na conversação e no ritmo do aluno.

A King não é uma escola de leitura de livro didático. O livro garante que nenhuma habilidade essencial fique de fora, mas a aula ideal é a que deixa o aluno mais perto do objetivo que o trouxe até aqui: uma viagem, uma promoção no trabalho, consumir entretenimento em inglês. Você tem liberdade para adaptar a aula ao perfil e ao momento de cada aluno.$t$, NULL, '{}'),
    (5, 'h2', NULL, $t$2 – Como o aluno chega até você$t$, NULL, '{}'),
    (6, 'text', NULL, $t$O time de vendas encontra o aluno e agenda uma aula experimental. Depois da matrícula, o pós-vendas faz a integração e libera os acessos dele. O aluno chega à sua agenda como uma oferta de contrato e, a partir do aceite, é seu: primeiro contato, primeira aula e as aulas da semana.

Pausa, transferência e cancelamento passam pelo Suporte ao Aluno.$t$, NULL, '{}'),
    (7, 'embed', NULL, NULL, '/welcome-path/a-king-por-dentro.html?parte=jornada', '{"altura":720}'),
    (8, 'h2', NULL, $t$3 – Quem faz o quê$t$, NULL, '{}'),
    (9, 'lista', NULL, $t$Recrutamento: fez o seu processo seletivo e o treinamento inicial, libera os acessos, define horários e recebe indicações de professores.
Coordenação: faz parte do time de qualidade e é o seu contato direto no dia a dia. Acompanha a qualidade das aulas e cuida do material didático.
Suporte ao Aluno: o único time que atende o aluno. Cuida de cancelamento, transferência, inadimplência e matrícula nova, avisa você de desistências e manda alunos que vieram de outro professor.
Vendas: traz alunos novos, agenda as aulas experimentais e lança essas aulas na plataforma.
Pós-vendas: integra o aluno que acabou de se matricular e libera os acessos dele.$t$, NULL, '{"ordered":false}'),
    (10, 'embed', NULL, NULL, '/welcome-path/a-king-por-dentro.html?parte=times', '{"altura":1250}'),
    (11, 'callout', NULL, $t$Se o seu aluno precisar de ajuda ou orientação da escola, encaminhe ao Suporte ao Aluno. Só eles atendem o aluno.$t$, NULL, '{"calloutVariant":"warning"}'),
    (12, 'embed', NULL, NULL, '/welcome-path/a-king-por-dentro.html?parte=mensagens', '{"altura":1400}'),
    (13, 'h2', NULL, $t$4 – Onde pedir ajuda$t$, NULL, '{}'),
    (14, 'text', NULL, $t$Você fala com a escola pelo WhatsApp da coordenação, das 9h às 18h. Se preferir conversar ao vivo, vá a um Plantão de Dúvidas, que acontece 3 vezes ao dia, ou peça a agenda de um coordenador para marcar uma reunião.

Você também está no grupo central da coordenação. Ele é só de avisos: ninguém manda mensagem nele. Lá chegam lembretes, campanhas, alunos novos e orientações gerais.

Qualquer contato seu com a coordenação, inclusive o aviso de que você já falou com um aluno novo, vai pelo WhatsApp dela.$t$, NULL, '{}'),
    (15, 'embed', NULL, NULL, '/welcome-path/a-king-por-dentro.html?parte=canais', '{"altura":1300}'),
    (16, 'h2', NULL, $t$5 – Onde está cada coisa$t$, NULL, '{}'),
    (17, 'lista', NULL, $t$Plataforma do professor: agenda, alunos, lançamentos, reposições, materiais e financeiro. É onde o seu dia começa.
MAPA: o manual de procedimentos da King, na plataforma do professor, em Materiais › Módulos. Na dúvida sobre uma regra, é lá que você confere.
Plataforma do aluno: onde o aluno entra na aula, vê o material e avisa falta.$t$, NULL, '{"ordered":false}'),
    (18, 'callout', NULL, $t$O Kit Professor, a antiga pasta no Google Drive, deixou de existir. O que importava foi para a plataforma do professor.$t$, NULL, '{"calloutVariant":"info"}'),
    (19, 'h2', NULL, $t$6 – Masterclass King$t$, NULL, '{}'),
    (20, 'text', NULL, $t$A Masterclass foi feita a partir da realidade das aulas da King, em quatro trilhas:

- Estratégias de engajamento e personalização;
- Habilidades linguísticas: listening, pronúncia e entonação;
- Gestão de aula e postura do professor;
- Metodologias para perfis diferentes.

Assista antes de começar as suas aulas. O link está na plataforma.$t$, NULL, '{}'),
    (21, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (22, 'lista', NULL, $t$Entender o que a King quer com cada aula.
Saber o caminho do aluno até a sua agenda.
Reconhecer o que cada time faz e encaminhar o aluno ao Suporte ao Aluno.
Saber onde pedir ajuda: WhatsApp da coordenação, Plantão de Dúvidas ou reunião.
Encontrar o MAPA e assistir à Masterclass antes da primeira aula.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$Um aluno pede ajuda para trocar a forma de pagamento da mensalidade. O que você faz?$t$,
      $j$["Troca na plataforma do professor.", "Encaminha o aluno ao Suporte ao Aluno.", "Pede para a coordenação trocar.", "Combina com o aluno de resolver depois da aula."]$j$,
      ARRAY[1], $t$Explicação: pagamento, matrícula, transferência e cancelamento são assuntos do aluno com a escola. Quem atende o aluno é só o Suporte ao Aluno.$t$),
  (1, $t$Quem agenda as aulas experimentais e lança essas aulas na plataforma?$t$,
      $j$["A coordenação.", "O recrutamento.", "O time de vendas.", "O próprio professor."]$j$,
      ARRAY[2], $t$Explicação: o time de vendas encontra alunos novos, agenda as experimentais e lança essas aulas na plataforma.$t$),
  (2, $t$Para que serve o grupo central da coordenação no WhatsApp?$t$,
      $j$["Para a escola mandar avisos: ninguém manda mensagem nele.", "Para tirar dúvidas com os outros professores.", "Para confirmar cada aula dada.", "Para falar com o Suporte ao Aluno."]$j$,
      ARRAY[0], $t$Explicação: o grupo central é só de avisos, como lembretes, campanhas e alunos novos. Dúvida vai para o WhatsApp da coordenação, das 9h às 18h, para o Plantão de Dúvidas ou para uma reunião com um coordenador.$t$),
  (3, $t$Quando assistir à Masterclass King?$t$,
      $j$["Só depois do primeiro mês de aulas.", "Quando a coordenação chamar.", "Não é necessária.", "Antes de começar as suas aulas."]$j$,
      ARRAY[3], $t$Explicação: a Masterclass foi feita a partir da realidade das aulas da King e é para assistir antes de começar. O link está na plataforma.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'A King por dentro';

COMMIT;

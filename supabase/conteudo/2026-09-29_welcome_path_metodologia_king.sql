-- Welcome Path 2.0 · Fase 2 · módulo "Metodologia King" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição e a hora de ativar. Só aplicar DEPOIS do deploy de
-- public/welcome-path/metodologia-king.html (os 3 blocos embed apontam para ela).
-- Fontes: MAPA 0 (metodologia), MAPA 10 (complementares), MAPA 16 (Materiais) e
-- vídeos 12, 13 e 14 do roteiro. Os vídeos 12 e 13 ainda falam do Kit Professor:
-- aqui o material é o da plataforma (o Kit acabou, 28/09). O chat de IA por
-- aluno do vídeo 14 entra como dica extra (decisão do João, 29/09).

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Metodologia King',
         'A aula em si: centrada no objetivo do aluno, com critério para avançar ou adaptar, bem planejada e conduzida do jeito King.',
         false, true, 80, 30
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Metodologia King$t$, NULL, '{}'),
    (2, 'text', NULL, $t$Até aqui, a trilha mostrou os processos: receber o aluno, lançar, repor, receber. Esta etapa é sobre a aula em si: o que a King espera de cada aula, como planejar e como conduzir.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – Aula centrada no objetivo do aluno$t$, NULL, '{}'),
    (4, 'text', NULL, $t$A King não é uma escola de leitura de livro didático. O centro do trabalho é ajudar cada aluno a alcançar o objetivo que o trouxe até aqui: uma viagem, uma promoção no trabalho, consumir entretenimento em inglês, desenvolvimento pessoal ou acadêmico.

As aulas têm foco na conversação, com situações reais do dia a dia, no ritmo de cada aluno e respeitando o nível dele (A1, A2, B1, B2, C1). O livro é a espinha dorsal da progressão: garante que nenhuma habilidade essencial fique de fora. Mas a aula ideal não é a que cumpre o capítulo do dia, é a que deixa o aluno sentindo que aprendeu algo novo e útil.$t$, NULL, '{}'),
    (5, 'h2', NULL, $t$2 – Sua liberdade, com critério$t$, NULL, '{}'),
    (6, 'text', NULL, $t$Você tem autonomia para adaptar a aula ao perfil, ao momento e às necessidades do aluno. Direcione o foco para:

- Speaking e conversação, para quem precisa de fluência oral;
- Gramática, para lacunas que travam a comunicação;
- Listening, para quem tem dificuldade de entender o que ouve;
- Vocabulário, para quem trava por falta de repertório;
- Pronúncia e entonação, para quem quer soar mais natural;
- Leitura e interpretação, para fins acadêmicos ou profissionais.

O critério de equilíbrio decide quando sair do livro: se o aluno já domina o conteúdo daquele ponto, avance. Se tem dificuldade em algo que o livro não cobre bem, use um material complementar. Se está desmotivado, mude a dinâmica antes de mudar o conteúdo. Aluno com foco profissional ou acadêmico pede complementares de Business English ou de Reading.$t$, NULL, '{}'),
    (7, 'callout', NULL, $t$Os materiais complementares estão no MAPA, organizados por habilidade: Listening, Grammar, Speaking, Vocabulary, Business English, Reading, Games, Kids & Teens e IA. Criatividade é bem-vinda, mas nada de conteúdo pago ou de outras escolas.$t$, NULL, '{"calloutVariant":"warning"}'),
    (8, 'embed', NULL, NULL, '/welcome-path/metodologia-king.html?parte=equilibrio', '{"altura":1000}'),
    (9, 'h2', NULL, $t$3 – Planejar a aula$t$, NULL, '{}'),
    (10, 'text', NULL, $t$Você não precisa de um roteiro rígido, mas aula sem direção perde tempo e engajamento. Antes de cada aula, tenha em mente:

- Onde o aluno está: nível, lição atual e as dificuldades anotadas nas observações anteriores;
- O que o aluno quer: o objetivo geral e o que ele pediu para praticar;
- O foco da aula: uma habilidade principal e o material de apoio, se houver.

Aula de 30 minutos exige objetividade: um foco claro, direto ao ponto. Aula de 60 minutos permite mais variação, mas um arco claro (aquecimento, conteúdo, prática e fechamento) rende mais.$t$, NULL, '{}'),
    (11, 'text', NULL, $t$O material está na plataforma, em Materiais: uma biblioteca de aulas prontas do Now We Are Talking, por nível. Busque pelo conteúdo ou filtre pelo nível. No modo apresentação você ajusta a fonte, abre o guia do professor (canto inferior esquerdo), usa ponteiro, desenho e texto sobre os slides e vê todos os slides de uma vez.

As anotações feitas na tela não ficam salvas. Se o conteúdo for importante, peça ao aluno que anote ou tire um print.$t$, NULL, '{}'),
    (12, 'embed', NULL, NULL, '/welcome-path/metodologia-king.html?parte=planejar', '{"altura":2050}'),
    (13, 'h2', NULL, $t$4 – Conduzir: apresentar, praticar, personalizar$t$, NULL, '{}'),
    (14, 'text', NULL, $t$Apresentar: introduza o conteúdo de forma clara e objetiva. Nunca pergunte "Você entendeu?": peça que o aluno use o que você explicou, e você vê na prática se ele entendeu.

Praticar: crie atividades de conversação que simulem situações reais.

Personalizar: adapte exemplos e exercícios ao contexto do aluno.

Incentive o aluno a ler, falar e montar as próprias frases, e evite traduções diretas: a ideia é que ele pense no idioma.$t$, NULL, '{}'),
    (15, 'embed', NULL, NULL, '/welcome-path/metodologia-king.html?parte=conduzir', '{"altura":1150}'),
    (16, 'h2', NULL, $t$5 – IA a seu favor$t$, NULL, '{}'),
    (17, 'text', NULL, $t$Ferramentas de IA como ChatGPT, Gemini e Gamma ajudam a preparar aulas mais criativas e personalizadas, e o MAPA indica outras para criar e adaptar atividades por nível.

Descreva para a IA o nível, o objetivo e os interesses do aluno e peça atividades, diálogos ou textos adaptados, com situações reais do dia a dia dele. Revise sempre: ajuste o vocabulário e a dificuldade. A IA ajuda a criar; quem transforma isso numa aula única é você.$t$, NULL, '{}'),
    (18, 'callout', NULL, $t$Dica extra: Abra na IA um chat para cada aluno e guarde nele o que você sabe dele: objetivos, interesses, rotina, dificuldades e o que vocês já trabalharam. Assim, a cada aula, você cria exercícios totalmente personalizados a partir da vida do aluno.$t$, NULL, '{"calloutVariant":"info"}'),
    (19, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (20, 'lista', NULL, $t$Dar aulas centradas no objetivo do aluno, com o livro como espinha dorsal.
Usar o critério de equilíbrio: avançar, complementar ou mudar a dinâmica.
Planejar cada aula com um foco claro, a partir das observações anteriores.
Encontrar o material em Materiais e usar o modo apresentação.
Conduzir apresentando, praticando e personalizando, sem "Você entendeu?" e sem tradução direta.
Usar IA para preparar aulas personalizadas, revisando o que ela cria.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$Seu aluno já domina o conteúdo da lição de hoje. O que o critério de equilíbrio manda fazer?$t$,
      $j$["Repetir a lição para garantir.", "Avançar no livro.", "Trocar o livro por um material complementar.", "Mudar a dinâmica da aula."]$j$,
      ARRAY[1], $t$Explicação: se o aluno domina o conteúdo do livro naquele ponto, avance. Complementar é para dificuldade que o livro não cobre bem; mudar a dinâmica é para aluno desmotivado.$t$),
  (1, $t$Qual é o melhor jeito de conferir se o aluno entendeu o que você explicou?$t$,
      $j$["Perguntar \"Você entendeu?\".", "Perguntar \"Ficou claro?\".", "Traduzir para o português e confirmar.", "Pedir que ele use o conteúdo numa frase ou situação dele."]$j$,
      ARRAY[3], $t$Explicação: nunca pergunte "Você entendeu?". Quando o aluno usa o conteúdo numa frase própria, você vê na prática se ele entendeu, e a aula fica pessoal.$t$),
  (2, $t$A aula é de 30 minutos. Como planejar?$t$,
      $j$["Um foco claro e direto ao ponto.", "Aquecimento, três temas diferentes e revisão no fim.", "Sem planejamento: a aula é curta demais para isso.", "Seguir a lição do livro do começo ao fim, sem desvio."]$j$,
      ARRAY[0], $t$Explicação: aulas de 30 minutos exigem objetividade, com uma habilidade principal. O arco com aquecimento, conteúdo, prática e fechamento cabe melhor nas aulas de 60 minutos.$t$),
  (3, $t$Qual destes materiais pode entrar na sua aula?$t$,
      $j$["Uma apostila paga de outro curso.", "Um material de outra escola de idiomas.", "Um complementar gratuito indicado no MAPA para a habilidade que o aluno precisa.", "Uma prova de outra escola."]$j$,
      ARRAY[2], $t$Explicação: os complementares do MAPA estão organizados por habilidade e servem de apoio ao material principal. Conteúdo pago ou de outras escolas não entra.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'Metodologia King';

COMMIT;

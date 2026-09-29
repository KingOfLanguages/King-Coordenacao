-- Welcome Path · módulo "Lançamento de aulas" (RASCUNHO: ativa = false).
-- Pedido do RH (parecer de 29/09): uma etapa só sobre o lançamento diário, com
-- prática. Entra depois de "Em sala" (a posição é aplicada por
-- 2026-09-29_welcome_path_parecer_rh.sql). O vídeo do MAPA 14 entra por fora do
-- repositório (link não vai para o repo público).
-- Fontes: MAPA 14 (Lançamento de Aulas), tela capturada em 25/09, vídeos
-- "Conhecendo a plataforma" e "Lançamento de aula" do roteiro, guia de XP e
-- decisões de 24 e 29/09. Página: public/welcome-path/lancamento-aulas.html.

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Lançamento de aulas',
         'Como e quando lançar cada aula: os tipos de registro, a presença bem preenchida, a falta com print e a rotina de todo dia.',
         false, true, 80, 20
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Lançamento de aulas$t$, NULL, '{}'),
    (2, 'text', NULL, $t$O lançamento é o processo mais importante da sua rotina na plataforma: é o registro oficial do que aconteceu com o aluno e a base do seu pagamento. Toda aula é lançada, todo dia, logo depois da aula.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – Onde e quando$t$, NULL, '{}'),
    (4, 'text', NULL, $t$Depois da aula, abra Aulas e Reposições › Lançamento de Aulas. Lá estão os alunos com aula no dia; lançou, a aula sai da lista.

O prazo é de até 24 horas. Passou disso, a aula vira pendência: tira 10 XP por dia e, acumulada, trava a sua agenda. Lançada no mesmo dia, rende +10 XP.$t$, NULL, '{}'),
    (5, 'h2', NULL, $t$2 – Os tipos de registro$t$, NULL, '{}'),
    (6, 'lista', NULL, $t$Presença: o aluno participou da aula, inteira ou em parte.
Falta do Aluno › Com reposição: o aluno avisou com 24 horas ou mais, dentro do limite de 4 no mês.
Falta do Aluno › Sem reposição: aviso em cima da hora, sem aviso ou com o limite do mês atingido. Pede o print da conversa, em Comprovação da aula.
Falta do Professor: quem faltou foi você. Gera reposição obrigatória para o aluno, sem prazo para vencer.$t$, NULL, '{"ordered":false}'),
    (7, 'h2', NULL, $t$3 – Uma presença bem lançada$t$, NULL, '{}'),
    (8, 'text', NULL, $t$Na presença, preencha o nível do aluno, se a aula foi Personalizada + livro ou Personalizada sem livro, o livro e a última aula aplicada, que é obrigatória quando você usa o livro.

E a observação: o que foi trabalhado, como o aluno respondeu e o que chamou atenção. "Aula realizada" não diz nada. Uma observação de verdade vale +3 XP e vira histórico do aluno.$t$, NULL, '{}'),
    (9, 'embed', NULL, NULL, '/welcome-path/lancamento-aulas.html?parte=lancar', '{"altura":1000}'),
    (10, 'callout', NULL, $t$Lançamentos feitos de forma incorreta ou propositalmente errada violam os valores da escola e podem levar ao encerramento da parceria.$t$, NULL, '{"calloutVariant":"danger"}'),
    (11, 'h2', NULL, $t$4 – A rotina$t$, NULL, '{}'),
    (12, 'text', NULL, $t$Esqueceu? A aba de pendências lista as aulas não lançadas em 24 horas: clique na aula e lance normalmente.

Errou? Avise a coordenação pelo WhatsApp no mesmo dia, sem esperar o fim do mês.

Feriado nacional também é lançado: falta do aluno sem reposição, com a observação "Feriado nacional" e o print do aviso ao aluno.$t$, NULL, '{}'),
    (13, 'embed', NULL, NULL, '/welcome-path/lancamento-aulas.html?parte=rotina', '{"altura":1000}'),
    (14, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (15, 'lista', NULL, $t$Lançar cada aula no mesmo dia, em Lançamento de Aulas.
Escolher o tipo de registro certo e o subtipo da falta do aluno.
Preencher a presença com nível, material, última aula e uma observação de verdade.
Anexar o print na falta sem reposição.
Resolver pendências e avisar a coordenação quando errar.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$Em quanto tempo a aula deve ser lançada?$t$,
      $j$["Até o fim da semana.", "No mesmo dia, e no máximo em 24 horas; depois disso vira pendência.", "Até o fim do mês, antes de autorizar o pagamento.", "Quando a coordenação pedir."]$j$,
      ARRAY[1], $t$Explicação: lançada no mesmo dia, a aula rende +10 XP. Passadas 24 horas, vira pendência, tira 10 XP por dia e, acumulada, trava a agenda.$t$),
  (1, $t$O aluno avisou uma hora antes que não viria. Como lançar?$t$,
      $j$["Falta do Aluno › Com reposição.", "Falta do Professor.", "Falta do Aluno › Sem reposição, com o print da conversa.", "Presença, porque ele avisou."]$j$,
      ARRAY[2], $t$Explicação: sem 24 horas de aviso não há direito a reposição. A falta sem reposição pede o print da conversa em Comprovação da aula.$t$),
  (2, $t$Numa presença com uso do livro, que campo a plataforma exige?$t$,
      $j$["A última aula aplicada.", "O print da conversa.", "O subtipo da falta.", "Nenhum além do tipo de registro."]$j$,
      ARRAY[0], $t$Explicação: com o livro, a última aula aplicada é obrigatória. É ela que registra onde o aluno parou.$t$),
  (3, $t$Qual observação está à altura de um lançamento de presença?$t$,
      $j$["Aula realizada.", "Aluna participou bem.", "Tudo certo, sem novidades.", "Aula 7 do livro e vídeo sobre a viagem dela. Usou bem put together; travou em hold on to, retomar na próxima."]$j$,
      ARRAY[3], $t$Explicação: a observação diz o que foi trabalhado e como o aluno respondeu. Observação genérica não vale como registro nem rende XP.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

COMMIT;

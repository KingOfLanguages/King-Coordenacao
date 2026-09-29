-- Welcome Path 2.0 · Fase 2 · módulo "Seu XP" (RASCUNHO: ativa = false).
-- Entra no fim da trilha e invisível para o professor; a coordenação revisa no
-- editor e decide a posição e a hora de ativar. Só aplicar DEPOIS do deploy de
-- public/welcome-path/seu-xp.html (os 4 blocos embed apontam para ela).
-- Fonte única: "Sistema de XP: funcionamento e regras" (complementar do MAPA,
-- KLS-709). Se a coordenação mudar algum valor, mudar aqui e na página.
-- Decisões do João em 29/09: Dia Perfeito = dia com o checklist da Home completo
-- (o checklist dá XP por tarefa e convive com o sistema de XP); frações de XP
-- arredondam para cima.

BEGIN;

WITH nova AS (
  INSERT INTO welcome_path_etapas (ordem, titulo, descricao, ativa, obrigatoria, nota_minima, minutos_estimados)
  SELECT COALESCE(MAX(ordem), 0) + 1,
         'Seu XP',
         'O que faz o seu XP subir e cair, os multiplicadores, a Patente, a Liga do mês e o que entra na virada.',
         false, true, 80, 25
  FROM welcome_path_etapas
  RETURNING id
),
blocos AS (
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  SELECT nova.id, b.ordem, b.tipo, b.titulo, b.conteudo, b.url, b.meta::jsonb
  FROM nova, (VALUES
    (1, 'h1', NULL, $t$Resumo da etapa – Seu XP$t$, NULL, '{}'),
    (2, 'text', NULL, $t$Tudo o que você faz no dia a dia gera XP: cada aula bem dada, cada aluno cuidado e cada mês fechado com capricho. Esta etapa mostra o que faz o seu XP subir, o que faz ele cair e para onde ele vai.$t$, NULL, '{}'),
    (3, 'h2', NULL, $t$1 – Como você ganha XP$t$, NULL, '{}'),
    (4, 'html', NULL, $t$<table><thead><tr><th>O que aconteceu</th><th>XP</th><th>O que saber</th></tr></thead><tbody><tr><td>Aula dada e lançada no mesmo dia</td><td><strong>+10</strong></td><td>Na hora do lançamento. O prazo para ganhar é o próprio dia da aula.</td></tr><tr><td>Reposição dada e lançada no prazo</td><td><strong>+15</strong></td><td>No lugar dos +10 da aula, não soma os dois.</td></tr><tr><td>Observação da aula de verdade</td><td><strong>+3</strong></td><td>Texto real e seu. Repetido ou “xxxxx” não conta.</td></tr><tr><td>Atualizar o material do aluno</td><td><strong>+20</strong></td><td>No máximo uma vez a cada 90 dias por aluno.</td></tr><tr><td>Avaliação de 5 estrelas</td><td><strong>+10</strong></td><td>Com 4 estrelas, +5. Comentário elogioso junto de 4 ou 5 estrelas, mais +2.</td></tr><tr><td>Seu aluno avançou de nível</td><td><strong>+150</strong></td><td>No máximo uma vez a cada 90 dias por aluno. Rebaixar não tira XP.</td></tr><tr><td>Tarefas do checklist diário, na Home</td><td><strong>+5 a +15</strong></td><td>Cada tarefa concluída soma XP.</td></tr><tr><td>Dia Perfeito</td><td><strong>+30</strong></td><td>O dia em que você completa o checklist da Home.</td></tr><tr><td>Aluno que fechou o mês com 80% ou mais de presença</td><td><strong>+50</strong></td><td>Por aluno, na virada do mês.</td></tr><tr><td>Aluno que continua ativo no fim do mês</td><td><strong>+40</strong></td><td>Por aluno, na virada do mês.</td></tr><tr><td>Mês inteiro sem nenhuma falta sua</td><td><strong>+200</strong></td><td>Exige ao menos uma aula lançada no mês.</td></tr><tr><td>Mais um mês de casa</td><td><strong>+500</strong></td><td>A cada mês que você fecha ativo na King.</td></tr></tbody></table>$t$, NULL, '{}'),
    (5, 'text', NULL, $t$Lançar com atraso não tira XP, mas deixa pontos na mesa: se você lança em outro dia, só deixa de ganhar os +10 daquela aula. Lançar no dia é sempre a jogada certa.

Dia Perfeito: é o dia em que você completa o checklist diário da Home. Ele vale +30 XP e aumenta a sua sequência de Dias Perfeitos, que turbina os seus ganhos (veja os multiplicadores).$t$, NULL, '{}'),
    (6, 'embed', NULL, NULL, '/welcome-path/seu-xp.html?parte=ganha', '{"altura":1450}'),
    (7, 'h2', NULL, $t$2 – Como você perde XP$t$, NULL, '{}'),
    (8, 'html', NULL, $t$<table><thead><tr><th>O que aconteceu</th><th>XP</th><th>O que saber</th></tr></thead><tbody><tr><td>Avaliação de 3, 2 ou 1 estrela</td><td><strong>−3, −6, −10</strong></td><td>Cada avaliação conta uma única vez.</td></tr><tr><td>Pendência de aula em aberto</td><td><strong>−10 por dia</strong></td><td>Todo dia de manhã, até você resolver. É a perda que mais cresce sozinha.</td></tr><tr><td>Uma aula lançada errada foi excluída por um gestor</td><td><strong>−50</strong></td><td>Uma vez por aula corrigida.</td></tr><tr><td>Sua falta foi reposta por outro professor</td><td><strong>−150</strong></td><td>Quando você não repõe a sua própria falta e um colega cobre.</td></tr><tr><td>Ajuste manual feito pela coordenação</td><td><strong>−150</strong></td><td>Sempre com um motivo registrado.</td></tr><tr><td>Você faltou na primeira aula de um aluno novo</td><td><strong>−300</strong></td><td>A maior penalidade do sistema.</td></tr></tbody></table>$t$, NULL, '{}'),
    (9, 'text', NULL, $t$O seu XP nunca fica negativo: o mínimo é zero. E uma perda nunca faz você descer de patente, no máximo atrasa a próxima.$t$, NULL, '{}'),
    (10, 'h2', NULL, $t$3 – Multiplicadores$t$, NULL, '{}'),
    (11, 'text', NULL, $t$Dois bônus turbinam os ganhos do dia a dia (aula, reposição, observação e material) e o Dia Perfeito:

- Pelo número de alunos ativos: até 6, ×1,0; de 7 a 10, ×1,1; de 11 a 15, ×1,2; de 16 a 20, ×1,3; 21 ou mais, ×1,4.
- Pela sequência de Dias Perfeitos: menos de 7 dias seguidos, ×1,0; 7 ou mais, ×1,2; 30 ou mais, ×1,5.

Os dois se multiplicam um sobre o outro, e frações de XP são arredondadas para cima. Eles não mexem nas penalidades, no avanço de nível nem nos prêmios do mês, e nunca reduzem nada de quem tem poucos alunos.$t$, NULL, '{}'),
    (12, 'embed', NULL, NULL, '/welcome-path/seu-xp.html?parte=multiplica', '{"altura":1200}'),
    (13, 'h2', NULL, $t$4 – Patente e Liga$t$, NULL, '{}'),
    (14, 'text', NULL, $t$Cada ponto de XP alimenta dois caminhos ao mesmo tempo, e as perdas descontam dos dois.

Patente é a sua carreira. São 10 níveis, e você sobe assim que o XP de toda a sua jornada cruza a marca de cada um. A Patente nunca desce.

Liga é a disputa do mês. Todo mês você compete pelo XP feito naquele mês. Na virada, dentro de cada Liga, os 10 melhores que bateram o XP mínimo sobem. Quem chega ao teto pula duas Ligas de uma vez (vale de Bronze a Platina). Ninguém cai de Liga, e o placar zera a cada mês. O XP que passa do teto não sobe o placar do mês, mas conta inteiro na Patente. Empate se desfaz por tempo de casa e, depois, por número de alunos.$t$, NULL, '{}'),
    (15, 'html', NULL, $t$<table><thead><tr><th>Patente</th><th>XP acumulado</th></tr></thead><tbody><tr><td>Rookie (Recruta)</td><td>0</td></tr><tr><td>Page (Pajem)</td><td>2.200</td></tr><tr><td>Squire (Escudeiro)</td><td>4.600</td></tr><tr><td>Knight (Cavaleiro)</td><td>7.200</td></tr><tr><td>Noble (Nobre)</td><td>10.000</td></tr><tr><td>Regent (Regente)</td><td>13.000</td></tr><tr><td>Chancellor (Chanceler)</td><td>16.200</td></tr><tr><td>Royal Advisor (Conselheiro Real)</td><td>19.600</td></tr><tr><td>Sovereign (Soberano)</td><td>23.200</td></tr><tr><td>King's Circle (Círculo do Rei)</td><td>27.000</td></tr></tbody></table><table><thead><tr><th>Liga</th><th>Sobe com (XP mínimo no mês)</th><th>Teto do mês</th></tr></thead><tbody><tr><td>Bronze</td><td>2.500</td><td>6.000</td></tr><tr><td>Prata</td><td>3.500</td><td>8.000</td></tr><tr><td>Ouro</td><td>4.500</td><td>10.500</td></tr><tr><td>Platina</td><td>6.000</td><td>14.000</td></tr><tr><td>Diamante</td><td>8.000</td><td>17.500</td></tr><tr><td>Liga King</td><td>O topo</td><td>Sem teto</td></tr></tbody></table>$t$, NULL, '{}'),
    (16, 'embed', NULL, NULL, '/welcome-path/seu-xp.html?parte=ligas', '{"altura":1250}'),
    (17, 'h2', NULL, $t$5 – A virada do mês$t$, NULL, '{}'),
    (18, 'text', NULL, $t$Os ganhos de rotina entram na hora. Pendências, faltas e o Dia Perfeito são apurados toda manhã. Os prêmios do mês e o fechamento das Ligas acontecem na virada de cada mês.

Os maiores ganhos são mensais e por aluno: mês de casa, mês sem falta, alunos com boa presença e alunos que continuam com você. No longo prazo, retenção e presença é o que mais move o seu XP.$t$, NULL, '{}'),
    (19, 'embed', NULL, NULL, '/welcome-path/seu-xp.html?parte=virada', '{"altura":1200}'),
    (20, 'callout', NULL, $t$Os valores do XP podem ser ajustados pela coordenação ao longo do tempo. O guia completo, "Sistema de XP: funcionamento e regras", está no MAPA.$t$, NULL, '{"calloutVariant":"info"}'),
    (21, 'h2', NULL, $t$Objetivo desta etapa$t$, NULL, '{}'),
    (22, 'lista', NULL, $t$Saber o que faz o seu XP subir e o que faz ele cair.
Lançar no dia para não deixar XP na mesa e não abrir pendência.
Completar o checklist da Home para fazer Dias Perfeitos e entender os multiplicadores.
Diferenciar a Patente, que nunca desce, da Liga, que é a disputa do mês.
Saber que retenção e presença dos alunos são o que mais move o XP no longo prazo.$t$, NULL, '{"ordered":false}')
  ) AS b(ordem, tipo, titulo, conteudo, url, meta)
  RETURNING id
)
INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
SELECT nova.id, q.ordem, 'multipla_escolha', q.enunciado, q.opcoes::jsonb, q.corretas, q.explicacao
FROM nova, (VALUES
  (0, $t$Você lançou a aula de segunda só na terça de manhã, antes de virar pendência. O que aconteceu com o seu XP?$t$,
      $j$["Perdeu 10 XP.", "Ganhou os 10 XP normalmente.", "Não perdeu nada, mas deixou de ganhar os 10 XP daquela aula.", "Perdeu 50 XP."]$j$,
      ARRAY[2], $t$Explicação: lançar em outro dia não tira XP, mas os +10 só vêm quando a aula é lançada no próprio dia. Pendência, que desconta 10 XP por dia, é outra coisa.$t$),
  (1, $t$Você perdeu 400 XP numa semana difícil. Você cai de patente?$t$,
      $j$["Não. A patente nunca desce: a perda só atrasa o próximo nível.", "Sim, se o XP ficar abaixo da marca da sua patente.", "Sim, e também cai de Liga.", "Só se o XP ficar negativo."]$j$,
      ARRAY[0], $t$Explicação: a Patente nunca rebaixa, e na Liga ninguém cai. O XP também nunca fica negativo: o mínimo é zero.$t$),
  (2, $t$Qual destas situações tira mais XP?$t$,
      $j$["Um dia com uma pendência aberta.", "Uma avaliação de 1 estrela.", "Uma aula lançada errada excluída por um gestor.", "Faltar na primeira aula de um aluno novo."]$j$,
      ARRAY[3], $t$Explicação: faltar na primeira aula de um aluno novo custa 300 XP, a maior penalidade. Pendência custa 10 por dia, a avaliação de 1 estrela, 10, e a aula excluída, 50.$t$),
  (3, $t$No longo prazo, o que mais move o seu XP?$t$,
      $j$["As avaliações de 5 estrelas.", "Os prêmios mensais por aluno: alunos com boa presença e que continuam com você, além do mês sem falta e do mês de casa.", "Lançar todas as aulas de uma vez no fim do mês.", "Trocar o nível dos alunos com frequência."]$j$,
      ARRAY[1], $t$Explicação: os maiores ganhos são mensais e por aluno: +50 por aluno com 80% ou mais de presença, +40 por aluno ativo, +200 pelo mês sem falta e +500 pelo mês de casa. Retenção e presença é o que mais move o XP.$t$)
) AS q(ordem, enunciado, opcoes, corretas, explicacao);

-- Conferência antes do COMMIT
SELECT e.ordem, e.titulo, e.ativa,
       (SELECT count(*)::text FROM welcome_path_blocos b WHERE b.etapa_id = e.id) AS blocos,
       (SELECT count(*)::text FROM welcome_path_questoes q WHERE q.etapa_id = e.id) AS questoes
FROM welcome_path_etapas e WHERE e.titulo = 'Seu XP';

COMMIT;

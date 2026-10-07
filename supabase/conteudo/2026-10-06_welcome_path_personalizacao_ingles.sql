-- Personalização da aprendizagem e uso do inglês em sala (texto do João, 06/10/2026).
-- Define o pilar que estava "a definir" no roteiro de onboarding (imersão na língua):
-- a maior parte da aula em inglês, inclusive nos níveis iniciais; o português pode e
-- deve entrar quando necessário, como apoio, sem substituir a exposição ao inglês.
--   Metodologia King: seções novas "2 – Personalização da aprendizagem" e "3 – Uso do
--     inglês em sala de aula" (texto do João, sem reescrever); seções 2–6 viram 4–8;
--     dois itens novos em "Objetivo desta etapa"; questão nova na prova.
--   Primeira aula: a frase "só recorra ao português se…" passa a seguir a regra nova.
-- As âncoras garantem aplicação única e falham se o conteúdo tiver mudado.
DO $do$
DECLARE n int;
BEGIN
  IF EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND conteudo = $t$2 – Personalização da aprendizagem$t$) THEN RAISE EXCEPTION 'já aplicado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 4 AND conteudo LIKE $t$A King não é uma escola de leitura%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '76a2e941', 4; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 5 AND conteudo = $t$2 – Sua liberdade, com critério$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '76a2e941', 5; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 22 AND conteudo LIKE $t$Dar aulas centradas no objetivo do aluno%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '76a2e941', 22; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 21 AND conteudo LIKE $t$Use o tempo restante%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', 'f7dd68d3', 21; END IF;

  -- Metodologia: renumera as seções 2–6 para 4–8.
  UPDATE welcome_path_blocos
     SET conteudo = (split_part(conteudo, ' – ', 1)::int + 2)::text || ' – ' || substring(conteudo FROM position(' – ' IN conteudo) + 3)
   WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND tipo = 'h2' AND conteudo ~ '^[2-6] – ';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 5 THEN RAISE EXCEPTION 'renumeração: % seções (esperado 5)', n; END IF;

  -- Metodologia: abre espaço depois da seção 1 e insere as duas seções novas.
  UPDATE welcome_path_blocos SET ordem = ordem + 5 WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem >= 5;
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('76a2e941-c702-4d40-bea8-0dbf4a9c06d4', 5, 'h2', $t$2 – Personalização da aprendizagem$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('76a2e941-c702-4d40-bea8-0dbf4a9c06d4', 6, 'text', $t$Na King, a personalização parte do reconhecimento de quem é o aluno: seus objetivos, sua realidade e seu contexto. A proposta é adaptar explicações, exemplos e atividades para que o conteúdo faça sentido para ele, utilizando recursos e abordagens lúdicas que favoreçam a apropriação do conhecimento. O objetivo não é apenas apresentar um conteúdo, mas fazer com que o aluno o incorpore à sua própria realidade e ao seu repertório.$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('76a2e941-c702-4d40-bea8-0dbf4a9c06d4', 7, 'h2', $t$3 – Uso do inglês em sala de aula$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('76a2e941-c702-4d40-bea8-0dbf4a9c06d4', 8, 'text', $t$O uso do inglês está diretamente ligado a essa proposta. Espera-se que a maior parte da aula aconteça em inglês, inclusive nos níveis iniciais, mantendo o aluno constantemente desafiado e criando uma jornada de aprendizagem mais funcional e eficaz.

Para isso, o professor deve utilizar ferramentas pedagógicas que facilitem a compreensão, como imagens, desenhos e recursos do Google Meet Premium, além de vídeos e outros materiais disponíveis na internet para criar contexto e ampliar o suporte visual.$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo, meta) VALUES ('76a2e941-c702-4d40-bea8-0dbf4a9c06d4', 9, 'callout', $t$O português pode e deve ser utilizado quando necessário, mas como uma ferramenta de apoio, sem substituir a exposição do aluno ao inglês. A ideia é criar condições para que ele compreenda, participe e se desenvolva progressivamente dentro da língua.$t$, '{"calloutVariant":"info"}'::jsonb);

  -- Metodologia: objetivos da etapa (o bloco foi de 22 para 27).
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Dar aulas centradas no objetivo do aluno, com o livro como espinha dorsal.$t$, $t$Dar aulas centradas no objetivo do aluno, com o livro como espinha dorsal.
Personalizar a partir de quem é o aluno: objetivos, realidade e contexto.
Conduzir a maior parte da aula em inglês, inclusive nos níveis iniciais, com o português como apoio.$t$)
   WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 27 AND position($t$Dar aulas centradas no objetivo do aluno, com o livro como espinha dorsal.$t$ IN conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '76a2e941', 27; END IF;

  -- Metodologia: questão nova na prova.
  INSERT INTO welcome_path_questoes (etapa_id, ordem, tipo, enunciado, opcoes, corretas, explicacao)
  SELECT '76a2e941-c702-4d40-bea8-0dbf4a9c06d4', COALESCE(MAX(ordem), -1) + 1, 'multipla_escolha',
         $t$Seu aluno é A1 e não entendeu uma explicação. O que a King espera que você faça?$t$,
         $j$["Passar a dar a aula em português até ele ganhar base.", "Seguir em inglês, apoiando com imagem, desenho ou vídeo, e usar o português como apoio quando for necessário.", "Nunca usar o português, mesmo que ele continue sem entender.", "Traduzir tudo o que você disser, para garantir."]$j$::jsonb,
         '{1}',
         $t$Explicação: a maior parte da aula é em inglês, inclusive nos níveis iniciais. Imagens, desenhos, vídeos e os recursos do Meet ajudam a entender; o português pode e deve entrar quando necessário, como apoio, sem substituir a exposição ao inglês.$t$
    FROM welcome_path_questoes WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4';

  -- Primeira aula: a regra antiga ("só… depois de tentar mímica…") vira a nova.
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Mantenha-se o máximo possível em inglês — só recorra ao português se o aluno tiver muita dificuldade, depois de tentar mímica, imagem e até escrever o que está falando.$t$, $t$Conduza a maior parte da aula em inglês, mesmo que o aluno seja iniciante. Para ele entender, use imagens, desenhos, mímica, vídeos e os recursos do Google Meet; o português pode entrar quando necessário, como apoio, sem substituir o inglês.$t$)
   WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 21 AND position($t$só recorra ao português$t$ IN conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', 'f7dd68d3', 21; END IF;
END $do$;

-- Parecer do RH, 2ª rodada (PDF "Onboarding Teachers (1)", 01/10): crescimento interno (A King por dentro),
-- agenda gradual (Sua agenda), combinados pedagógicos e nivelamento aprofundado (Primeira aula),
-- política de reposição (Lançamento), agenda de 6 meses + comunicação assertiva + práticas a evitar (Boas Práticas),
-- recursos permitidos/proibidos + aulas de conversação (Metodologia). As âncoras garantem aplicação única.
DO $do$
DECLARE n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '8bd175e0-80d0-4c88-8865-bb19fbc65480' AND ordem = 20 AND conteudo LIKE $t$A Masterclass foi feita%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '8bd175e0', 20; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '8bd175e0-80d0-4c88-8865-bb19fbc65480' AND ordem = 21 AND conteudo LIKE $t$Objetivo desta etapa%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '8bd175e0', 21; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '7023f80b-4fbe-4dee-881c-6fe3510af6db' AND ordem = 4 AND conteudo LIKE $t$Toda célula que fica livre%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '7023f80b', 4; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 13 AND conteudo LIKE $t$Comece pelo getting to know%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', 'f7dd68d3', 13; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 17 AND conteudo LIKE $t$Passo 6 – Dê a aula%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', 'f7dd68d3', 17; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 26 AND conteudo LIKE $t$- Acessar a aula%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', 'f7dd68d3', 26; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem = 6 AND conteudo LIKE $t$Presença:%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '3f26da0b', 6; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem = 7 AND conteudo LIKE $t$3 – Uma presença bem lançada%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '3f26da0b', 7; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem = 11 AND conteudo LIKE $t$4 – A rotina%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '3f26da0b', 11; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem = 15 AND conteudo LIKE $t$Lançar cada aula%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '3f26da0b', 15; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 3 AND conteudo LIKE $t$Boas práticas não são%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '033f205f', 3; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 10 AND conteudo LIKE $t$3 – Comunicação com a coordenação%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '033f205f', 10; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 13 AND conteudo LIKE $t$4 – Acompanhamento%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '033f205f', 13; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 22 AND conteudo LIKE $t$Objetivo desta etapa%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '033f205f', 22; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 23 AND conteudo LIKE $t$Ao final%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '033f205f', 23; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 14 AND conteudo LIKE $t$Apresentar:%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '76a2e941', 14; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 16 AND conteudo LIKE $t$5 – IA a seu favor%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '76a2e941', 16; END IF;
  IF NOT EXISTS (SELECT 1 FROM welcome_path_blocos WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 20 AND conteudo LIKE $t$Dar aulas centradas%$t$) THEN RAISE EXCEPTION 'ancora: etapa % bloco %', '76a2e941', 20; END IF;
  UPDATE welcome_path_blocos SET ordem = ordem + 2 WHERE etapa_id = '8bd175e0-80d0-4c88-8865-bb19fbc65480' AND ordem >= 21;
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('8bd175e0-80d0-4c88-8865-bb19fbc65480', 21, 'h2', $t$7 – Crescer na King$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('8bd175e0-80d0-4c88-8865-bb19fbc65480', 22, 'text', $t$A King reconhece os talentos da casa. Quem se destaca pode crescer na horizontal, participando de projetos especiais, ou na vertical, assumindo vagas dentro da escola.

O caminho começa pelo que esta trilha ensina: aulas bem dadas, alunos que ficam e uma parceria de confiança com a coordenação.$t$);
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Encontrar o MAPA e assistir à Masterclass antes da primeira aula.$t$, $t$Encontrar o MAPA e assistir à Masterclass antes da primeira aula.
Saber que a King abre espaço para crescer: projetos especiais e vagas na escola.$t$) WHERE etapa_id = '8bd175e0-80d0-4c88-8865-bb19fbc65480' AND ordem = 24 AND position($t$Encontrar o MAPA e assistir à Masterclass antes da primeira aula.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '8bd175e0', 24; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Antes de fechar um deles, o KMS pergunta se você tem certeza.$t$, $t$Antes de fechar um deles, o KMS pergunta se você tem certeza.

A agenda se enche aos poucos e depende da sua disponibilidade: pode levar 2 semanas ou mais para ficar completa. Os horários de alta demanda, os mesmos falados na entrevista, são os primeiros a encher.$t$) WHERE etapa_id = '7023f80b-4fbe-4dee-881c-6fe3510af6db' AND ordem = 4 AND position($t$Antes de fechar um deles, o KMS pergunta se você tem certeza.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '7023f80b', 4; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Apresente sua didática e os tipos de feedback que você dá.$t$, $t$Apresente sua didática e os tipos de feedback que você dá.

Alinhe também os combinados pedagógicos: explique como funcionam as aulas, mostre a importância de o aluno participar ativamente e alinhe expectativas realistas de progresso.$t$) WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 13 AND position($t$Apresente sua didática e os tipos de feedback que você dá.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', 'f7dd68d3', 13; END IF;
  UPDATE welcome_path_blocos SET ordem = ordem + 3 WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem >= 17;
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('f7dd68d3-ad85-4c63-be26-70801611f892', 17, 'text', $t$O nivelamento é o ponto de partida, não a sentença final. Deixe claro para o aluno que é um nivelamento inicial e, nas aulas seguintes, revise o nível pelo desempenho real, observando também a escrita, a leitura e a escuta.

Ficou em dúvida entre dois níveis? Escolha o mais baixo. Ajustar para cima depois é fácil; rebaixar o aluno desgasta a relação com ele.

Repare também na confiança e na timidez do aluno. Isso já ajuda a montar o perfil dele e a escolher o tom das aulas, mais firme ou mais próximo.

Sinais que costumam indicar cada nível:$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('f7dd68d3-ad85-4c63-be26-70801611f892', 18, 'lista', $t$A1 e A2: frases quebradas a cada uma ou duas palavras, enquanto ele pensa na próxima; erros na conjugação com he, she e it; preposições sobrando, faltando ou erradas.
B1 e B2: frases quebradas em intervalos maiores, a cada três ou quatro palavras, apoiadas em estruturas prontas, como repetir parte da pergunta para responder; erros no uso e na conjugação do passado.
C1 e C2: erros no uso dos perfects, dos continuous e da combinação dos dois.$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('f7dd68d3-ad85-4c63-be26-70801611f892', 19, 'callout', $t$Nível não é só vocabulário sofisticado: é controle, naturalidade e flexibilidade no uso do inglês.$t$);
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$- Compreender que a primeira aula une conhecer o aluno, nivelamento e aula prática, nessa ordem;$t$, $t$- Compreender que a primeira aula une conhecer o aluno, nivelamento e aula prática, nessa ordem;
- Alinhar com o aluno os combinados pedagógicos e expectativas realistas de progresso;$t$) WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 29 AND position($t$- Compreender que a primeira aula une conhecer o aluno, nivelamento e aula prática, nessa ordem;$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', 'f7dd68d3', 29; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$- Aplicar o teste de nivelamento avaliando os pontos certos, sem expor a nota do aluno;$t$, $t$- Aplicar o teste de nivelamento avaliando os pontos certos, sem expor a nota do aluno;
- Tratar o nivelamento como ponto de partida e, na dúvida entre dois níveis, escolher o mais baixo;$t$) WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 29 AND position($t$- Aplicar o teste de nivelamento avaliando os pontos certos, sem expor a nota do aluno;$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', 'f7dd68d3', 29; END IF;
  UPDATE welcome_path_questoes SET explicacao = replace(explicacao, $t$Caso o aluno não consiga acessar, o professor envia o link da plataforma do aluno, disponível no MAPA.$t$, $t$O aluno entra pela plataforma dele, que vai no lembrete; se, passados 2 minutos do início, ele não conseguir entrar, o professor manda o link do Meet pelo WhatsApp.$t$)
    WHERE etapa_id = 'f7dd68d3-ad85-4c63-be26-70801611f892' AND ordem = 0 AND position($t$disponível no MAPA.$t$ in explicacao) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'questao 7.0'; END IF;
  UPDATE welcome_path_blocos SET ordem = ordem + 2 WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem >= 7;
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('3f26da0b-11c3-497c-8b4c-949467fbb94a', 7, 'h2', $t$3 – A política de reposição$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('3f26da0b-11c3-497c-8b4c-949467fbb94a', 8, 'lista', $t$Critério: o aluno tem direito à reposição quando avisa a falta com pelo menos 24 horas de antecedência.
Motivo nobre: se o aluno não avisou a tempo, mas teve uma justificativa plausível, fica a seu critério repor. Se abrir a exceção, registre por escrito no WhatsApp.
Quantidade: no máximo 4 faltas com direito a reposição por mês. Da 5ª em diante, a falta é sem direito.
Falta do professor: sempre reposta, não importa quantas reposições o aluno já tenha.
Validade: o aluno tem 30 dias para agendar e fazer a reposição. Passou disso, o direito expira.$t$);
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$3 – Uma presença bem lançada$t$, $t$4 – Uma presença bem lançada$t$) WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem = 9 AND position($t$3 – Uma presença bem lançada$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '3f26da0b', 9; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$4 – A rotina$t$, $t$5 – A rotina$t$) WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem = 13 AND position($t$4 – A rotina$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '3f26da0b', 13; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Escolher o tipo de registro certo e o subtipo da falta do aluno.$t$, $t$Escolher o tipo de registro certo e o subtipo da falta do aluno.
Aplicar a política de reposição: 24 horas de aviso, motivo nobre, limite de 4 no mês, falta sua sempre reposta e validade de 30 dias.$t$) WHERE etapa_id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND ordem = 17 AND position($t$Escolher o tipo de registro certo e o subtipo da falta do aluno.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '3f26da0b', 17; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$São seis áreas.$t$, $t$São seis áreas e, no fim, as práticas a evitar.$t$) WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 3 AND position($t$São seis áreas.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '033f205f', 3; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$- Linguagem de ambiente de ensino durante toda a aula.$t$, $t$- Linguagem de ambiente de ensino durante toda a aula;
- A agenda combinada na entrevista mantida por pelo menos 6 meses — é ela que garante aulas bem dadas e rotina, para os alunos e para você.$t$) WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 5 AND position($t$- Linguagem de ambiente de ensino durante toda a aula.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '033f205f', 5; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$3 – Comunicação com a coordenação$t$, $t$3 – Comunicação com a coordenação e com o aluno$t$) WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 10 AND position($t$3 – Comunicação com a coordenação$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '033f205f', 10; END IF;
  UPDATE welcome_path_blocos SET ordem = ordem + 2 WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem >= 13;
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('033f205f-fd65-4211-96e6-c82b80dc52a9', 13, 'text', $t$Com o aluno e com a escola, a comunicação é assertiva:$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('033f205f-fd65-4211-96e6-c82b80dc52a9', 14, 'lista', $t$Responda com agilidade e clareza: mostrar disponibilidade transmite responsabilidade e respeito pelo tempo do outro.
Seja direto, mas cordial: vá ao ponto, sem mensagens longas e confusas. O tom é firme, porém empático.
Mantenha a coerência: suas respostas e decisões seguem as orientações e os valores da escola. Isso reforça o profissionalismo e evita mal-entendidos.
Adapte o tom ao público: com o aluno, uma linguagem próxima e acessível; com a equipe da escola, um tom mais institucional e objetivo.$t$);
  UPDATE welcome_path_blocos SET ordem = ordem + 3 WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem >= 24;
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('033f205f-fd65-4211-96e6-c82b80dc52a9', 24, 'h2', $t$7 – Práticas a evitar$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('033f205f-fd65-4211-96e6-c82b80dc52a9', 25, 'text', $t$Assim como as boas práticas, vale reforçar o que não se faz. São pontos que a coordenação acompanha de perto:$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('033f205f-fd65-4211-96e6-c82b80dc52a9', 26, 'lista', $t$Não falar com o aluno quando é preciso: no primeiro contato e no horário da aula.
Faltar ou chegar atrasado às aulas.
Atrasar o lançamento das aulas.
Recusar alunos com horário livre na agenda. Se não pode dar aula num horário, feche-o como Horário ocupado.
Acumular feedbacks negativos dos alunos: cada avaliação ruim é um aviso para ajustar a aula.
Baixa retenção: alunos que saem por falta de acompanhamento. As seções 4 e 6 desta etapa mostram como segurar o aluno.$t$);
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$- Acionar a coordenação na hora certa e pelo canal certo;$t$, $t$- Acionar a coordenação na hora certa e pelo canal certo;
- Comunicar-se de forma assertiva com o aluno e com a escola;$t$) WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 28 AND position($t$- Acionar a coordenação na hora certa e pelo canal certo;$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '033f205f', 28; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$- Reconhecer sinais de desengajamento e agir cedo pra reter o aluno.$t$, $t$- Reconhecer sinais de desengajamento e agir cedo pra reter o aluno;
- Evitar as práticas que a coordenação acompanha de perto.$t$) WHERE etapa_id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND ordem = 28 AND position($t$- Reconhecer sinais de desengajamento e agir cedo pra reter o aluno.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '033f205f', 28; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Recursos externos gratuitos, como vídeos, jogos e textos, são bem-vindos; conteúdo pago ou de outras escolas, não.$t$, $t$Recursos externos gratuitos, como músicas, vídeos, jogos e textos, são bem-vindos. Materiais de outras escolas, conteúdo pago e recomendações comerciais ao aluno, como compras e assinaturas, não.$t$) WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 14 AND position($t$Recursos externos gratuitos, como vídeos, jogos e textos, são bem-vindos; conteúdo pago ou de outras escolas, não.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '76a2e941', 14; END IF;
  UPDATE welcome_path_blocos SET ordem = ordem + 2 WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem >= 16;
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('76a2e941-c702-4d40-bea8-0dbf4a9c06d4', 16, 'h2', $t$5 – Aulas de conversação$t$);
  INSERT INTO welcome_path_blocos (etapa_id, ordem, tipo, conteudo) VALUES ('76a2e941-c702-4d40-bea8-0dbf4a9c06d4', 17, 'lista', $t$Adapte o tema, não o formato: a conversa pode, e deve, existir em todos os níveis. O que muda é a complexidade da linguagem.
Fluency feedback antes de accuracy feedback: durante a conversa, priorize a comunicação; corrija depois, de forma leve e no contexto.
Tenha um objetivo comunicativo claro: toda aula de conversação precisa de um communication goal. Não é falar por falar.$t$);
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$5 – IA a seu favor$t$, $t$6 – IA a seu favor$t$) WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 18 AND position($t$5 – IA a seu favor$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '76a2e941', 18; END IF;
  UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $t$Conduzir apresentando, praticando e personalizando, sem "Você entendeu?" e sem tradução direta.$t$, $t$Conduzir apresentando, praticando e personalizando, sem "Você entendeu?" e sem tradução direta.
Conduzir conversas com tema no nível do aluno, foco na fluência e um objetivo comunicativo claro.$t$) WHERE etapa_id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4' AND ordem = 22 AND position($t$Conduzir apresentando, praticando e personalizando, sem "Você entendeu?" e sem tradução direta.$t$ in conteudo) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'replace falhou: etapa % bloco %', '76a2e941', 22; END IF;
  UPDATE welcome_path_etapas SET descricao = replace(descricao, $t$quem faz o quê e onde pedir ajuda.$t$, $t$quem faz o quê, onde pedir ajuda e como crescer na escola.$t$) WHERE id = '8bd175e0-80d0-4c88-8865-bb19fbc65480' AND position($t$quem faz o quê e onde pedir ajuda.$t$ in descricao) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'descricao %', '8bd175e0'; END IF;
  UPDATE welcome_path_etapas SET descricao = replace(descricao, $t$os tipos de registro, a presença$t$, $t$os tipos de registro, a política de reposição, a presença$t$) WHERE id = '3f26da0b-11c3-497c-8b4c-949467fbb94a' AND position($t$os tipos de registro, a presença$t$ in descricao) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'descricao %', '3f26da0b'; END IF;
  UPDATE welcome_path_etapas SET descricao = replace(descricao, $t$reposições e como segurar o aluno.$t$, $t$reposições, como segurar o aluno e o que evitar.$t$) WHERE id = '033f205f-fd65-4211-96e6-c82b80dc52a9' AND position($t$reposições e como segurar o aluno.$t$ in descricao) > 0;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'descricao %', '033f205f'; END IF;
  UPDATE welcome_path_etapas SET minutos_estimados = 21 WHERE id = '8bd175e0-80d0-4c88-8865-bb19fbc65480';
  UPDATE welcome_path_etapas SET minutos_estimados = 32 WHERE id = 'f7dd68d3-ad85-4c63-be26-70801611f892';
  UPDATE welcome_path_etapas SET minutos_estimados = 22 WHERE id = '3f26da0b-11c3-497c-8b4c-949467fbb94a';
  UPDATE welcome_path_etapas SET minutos_estimados = 35 WHERE id = '033f205f-fd65-4211-96e6-c82b80dc52a9';
  UPDATE welcome_path_etapas SET minutos_estimados = 32 WHERE id = '76a2e941-c702-4d40-bea8-0dbf4a9c06d4';
  IF EXISTS (SELECT 1 FROM welcome_path_blocos WHERE position(chr(13) in coalesce(conteudo,'')) > 0) THEN RAISE EXCEPTION 'CR no conteudo'; END IF;
  IF EXISTS (SELECT etapa_id, ordem FROM welcome_path_blocos WHERE etapa_id IN ('8bd175e0-80d0-4c88-8865-bb19fbc65480','7023f80b-4fbe-4dee-881c-6fe3510af6db','f7dd68d3-ad85-4c63-be26-70801611f892','3f26da0b-11c3-497c-8b4c-949467fbb94a','033f205f-fd65-4211-96e6-c82b80dc52a9','76a2e941-c702-4d40-bea8-0dbf4a9c06d4') GROUP BY 1,2 HAVING count(*) > 1) THEN RAISE EXCEPTION 'ordem duplicada'; END IF;
END $do$;

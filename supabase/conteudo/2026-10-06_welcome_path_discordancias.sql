-- Welcome Path: discordâncias com o roteiro e as decisões de 06/10/2026.
-- 1) Nome do material: "Now We're Talking". 2) Níveis do A1 ao C2.
-- 3) A tela do KMS se chama "Histórico do Aluno" (não "Perfil dos Alunos").
-- 4) O link da plataforma do aluno vai já na 1ª mensagem (decisão de 06/10).
-- 5) Fórmula do pagamento: só a falta com direito AINDA NÃO REPOSTA segura valor.
-- Cada troca exige pelo menos 1 linha alterada; se alguma não casar, nada é gravado.
DO $$
DECLARE n int; tot text := '';
  par text[][] := ARRAY[
    ['Now We Are Talking', 'Now We''re Talking'],
    ['(A1, A2, B1, B2, C1)', '(do A1 ao C2)'],
    ['No Perfil dos Alunos, clique', 'No Histórico do Aluno, clique'],
    ['material do aluno no Perfil dos Alunos', 'material do aluno no Histórico do Aluno'],
    ['O lembrete de que o aluno acessa a aula pela plataforma do aluno', 'O link da plataforma do aluno, por onde ele entra na aula'],
    ['o lembrete de entrar pela plataforma do aluno', 'o link da plataforma do aluno, por onde ele entra na aula']
  ];
  q text[][] := ARRAY[
    ['no Perfil dos Alunos?', 'no Histórico do Aluno?'],
    ['o lembrete de que o aluno acessa a aula pela plataforma do aluno', 'o link da plataforma do aluno, por onde ele entra na aula'],
    ['o lembrete de acessar pela plataforma do aluno', 'o link da plataforma do aluno'],
    ['faltas com direito a reposição no mês)', 'faltas com direito a reposição ainda não repostas)'],
    ['as faltas com direito a reposição do mês.', 'as faltas com direito a reposição ainda não repostas.']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(par,1) LOOP
    UPDATE welcome_path_blocos SET conteudo = replace(conteudo, par[i][1], par[i][2])
     WHERE strpos(conteudo, par[i][1]) > 0;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'bloco sem casar: %', par[i][1]; END IF;
    tot := tot || format(' B%s=%s', i, n);
  END LOOP;
  FOR i IN 1..array_length(q,1) LOOP
    UPDATE welcome_path_questoes SET
      enunciado  = replace(enunciado, q[i][1], q[i][2]),
      opcoes     = replace(opcoes::text, q[i][1], q[i][2])::jsonb,
      explicacao = replace(explicacao, q[i][1], q[i][2])
     WHERE strpos(enunciado || opcoes::text || coalesce(explicacao,''), q[i][1]) > 0;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'questão sem casar: %', q[i][1]; END IF;
    tot := tot || format(' Q%s=%s', i, n);
  END LOOP;
  IF current_setting('wp.ensaio', true) = 'sim' THEN RAISE EXCEPTION 'ENSAIO OK:%', tot; END IF;
  RAISE NOTICE 'GRAVADO:%', tot;
END $$;

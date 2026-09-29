-- Correções de texto nas etapas que já estão no ar (3, 4, 6 e 7), a partir das
-- decisões do João em 29/09:
--   · o nivelamento fica em Materiais, no módulo "Primeira aula e nivelamento";
--   · o grupo onde se confirmava o primeiro contato não existe mais: a
--     confirmação vai para o WhatsApp da coordenação;
--   · o link do Meet vai só se, passados 2 minutos do início, o aluno tiver
--     dificuldade para entrar (antes: 5 minutos);
--   · o relatório do mês é o "Resumo financeiro", na aba Financeira;
--   · aluno transferido recebe a mensagem no mesmo dia do aceite;
--   · os títulos "Resumo da Etapa N – …" perdem o número (a ordem mudou).
-- Cada troca usa replace() e só acontece se o trecho antigo ainda estiver lá:
-- rodar duas vezes não estraga nada, e texto editado pela coordenação depois
-- de 29/09 fica como está (a conferência no fim mostra o que sobrou).

BEGIN;

-- ─── Etapa 3 · Primeiro contato ───────────────────────────────────────────
UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$Passo 4 – Confirme no grupo$o$,
  $n$Passo 4 – Confirme com a coordenação$n$)
WHERE id = '42148fb7-52da-4629-afa4-a421c6bc0dfd';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$Depois de falar com o aluno, confirme no grupo que o contato foi feito.$o$,
  $n$Depois de falar com o aluno, avise a coordenação, pelo WhatsApp dela, que o contato foi feito.$n$)
WHERE id = '878e02d6-227d-48eb-badd-d03a7704b706';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$Só envie o link do Google Meet se o aluno não aparecer nos primeiros 5 minutos.$o$,
  $n$Não mande o link do Google Meet antes da aula. Só envie o link se, passados 2 minutos do início, o aluno tiver dificuldade para entrar.$n$)
WHERE id = 'efa56cc1-943d-4b69-b7bc-18dd35286e80';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$aplique o teste de nivelamento seguindo as instruções do próprio link.$o$,
  $n$aplique o teste de nivelamento. Ele fica na plataforma do professor, em Materiais, no módulo "Primeira aula e nivelamento".$n$)
WHERE id = 'f65dab28-e062-4d65-a50e-57b65f5d37bb';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$Confirmar o contato no grupo como parte do processo;$o$,
  $n$Confirmar o contato com a coordenação, pelo WhatsApp dela, como parte do processo;$n$)
WHERE id = 'de860d4e-1292-4fad-bc7f-c883c7dd9460';

UPDATE welcome_path_questoes SET
  opcoes = replace(opcoes::text, $o$Confirmar no grupo que o contato foi feito.$o$, $n$Avisar a coordenação, pelo WhatsApp dela, que o contato foi feito.$n$)::jsonb,
  explicacao = replace(explicacao, $o$Confirmar no grupo é parte obrigatória do processo.$o$, $n$Avisar a coordenação, pelo WhatsApp dela, é parte obrigatória do processo.$n$)
WHERE id = 'e2c67e6e-5c43-4052-a233-66a328430188';

UPDATE welcome_path_questoes SET
  opcoes = replace(opcoes::text,
    $o$Enviar o lembrete 5 minutos antes da aula e só enviar o link do Google Meet se o aluno não aparecer nos primeiros 5 minutos.$o$,
    $n$Enviar o lembrete com o link da plataforma do aluno 5 minutos antes e só enviar o link do Google Meet se, passados 2 minutos do início, o aluno tiver dificuldade para entrar.$n$)::jsonb,
  explicacao = replace(explicacao,
    $o$O link do Google Meet só é enviado caso o aluno não apareça nos primeiros 5 minutos de aula.$o$,
    $n$O link do Google Meet não vai antes da aula: só é enviado se, passados 2 minutos do início, o aluno tiver dificuldade para entrar.$n$)
WHERE id = '59f41039-8c0b-408a-946a-944b7ed4af17';

UPDATE welcome_path_questoes SET
  opcoes = replace(replace(replace(opcoes::text,
    $o$desde que você confirme no grupo no dia do aceite$o$, $n$desde que você avise a coordenação no dia do aceite$n$),
    $o$além de faltar a confirmação no grupo$o$, $n$além de faltar o aviso à coordenação$n$),
    $o$apenas pela ausência da confirmação no grupo$o$, $n$apenas pela falta do aviso à coordenação$n$)::jsonb,
  explicacao = replace(explicacao,
    $o$a confirmação no grupo é obrigatória$o$, $n$avisar a coordenação, pelo WhatsApp dela, é obrigatório$n$)
WHERE id = '814b412d-b7d9-4c88-ae3f-8eef679f21a0';

-- ─── Etapa 4 · Primeira aula ──────────────────────────────────────────────
UPDATE welcome_path_blocos SET conteudo =
  $n$O teste de nivelamento fica na plataforma do professor, em Materiais, no módulo "Primeira aula e nivelamento".

$n$ || conteudo
WHERE id = '7ba07fd4-6253-4079-a304-58e10f18594c'
  AND conteudo LIKE 'Aplique o placement test%';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo,
  $o$Se o aluno já era da King e veio de outro professor, o processo é o mesmo, com uma diferença: você não faz nivelamento.$o$,
  $n$Se o aluno já era da King e veio de outro professor, o processo é o mesmo, com uma diferença: você não faz nivelamento. Mande a mensagem de apresentação no mesmo dia em que ele for aceito na sua agenda.$n$)
WHERE id = '26b6c007-e9a6-460a-8cfc-570b6177dc86';

-- ─── Etapa 6 · Pagamento ──────────────────────────────────────────────────
UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$)
WHERE id = '69ee9dd7-396b-45e0-ab44-dcc207c08cd1';

UPDATE welcome_path_blocos SET conteudo = replace(replace(conteudo,
  $o$Na aba Financeiro, o Resumo Consolidado mostra$o$, $n$Na aba Financeira, o Resumo financeiro mostra$n$),
  $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$)
WHERE id = '221aa67f-6ebc-4ce2-b2bb-58fa14799afb';

UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$)
WHERE id IN ('2a777174-2060-4083-b83c-11447e7c30eb', '0456f827-d41b-44f3-b1c4-956b0cd2b7d0');

UPDATE welcome_path_questoes SET
  enunciado = replace(enunciado, $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$),
  opcoes = replace(opcoes::text, $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$)::jsonb,
  explicacao = replace(replace(explicacao, $o$na aba Financeiro$o$, $n$na aba Financeira$n$), $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$)
WHERE id = '899a1bd9-8b5c-45a9-b05e-6a47cb0050b5';

-- ─── Etapa 7 · Encerramento ───────────────────────────────────────────────
UPDATE welcome_path_blocos SET conteudo = replace(replace(replace(conteudo,
  $o$Em seguida, confirme no grupo da coordenação.$o$,
  $n$Em seguida, avise a coordenação, pelo WhatsApp dela, que o contato foi feito.$n$),
  $o$O link direto do Meet só vai se ele não entrar nos primeiros 5 minutos.$o$,
  $n$O link do Meet não vai antes: só se, passados 2 minutos do início, ele tiver dificuldade para entrar.$n$),
  $o$confira o Resumo Consolidado$o$, $n$confira o Resumo financeiro$n$)
WHERE id = 'cae30d74-30d9-4f45-9155-4477933c090e';

UPDATE welcome_path_questoes SET
  opcoes = replace(replace(replace(opcoes::text,
    $o$esperar a véspera da primeira aula para se apresentar e então confirmar no grupo.$o$,
    $n$esperar a véspera da primeira aula para se apresentar e então avisar a coordenação.$n$),
    $o$mandar a mensagem de apresentação o quanto antes e confirmar no grupo da coordenação que o contato foi feito.$o$,
    $n$mandar a mensagem de apresentação o quanto antes e avisar a coordenação, pelo WhatsApp dela, que o contato foi feito.$n$),
    $o$Confirmar no grupo que recebeu o aluno e aguardar que ele entre em contato.$o$,
    $n$Avisar a coordenação que recebeu o aluno e aguardar que ele entre em contato.$n$)::jsonb,
  explicacao = replace(explicacao,
    $o$a confirmação no grupo é o que faz a coordenação saber$o$,
    $n$o aviso à coordenação, pelo WhatsApp dela, é o que faz a coordenação saber$n$)
WHERE id = '6dd0c52f-0adb-41be-9282-69371bfa3417';

UPDATE welcome_path_questoes SET
  enunciado = replace(enunciado, $o$e, às 19h05, o aluno ainda não entrou na sala.$o$, $n$e, às 19h02, o aluno ainda não conseguiu entrar na sala.$n$),
  explicacao = replace(explicacao,
    $o$O link direto do Meet só vai quando o aluno não aparece nos primeiros 5 minutos.$o$,
    $n$O link direto do Meet não vai antes da aula: vai quando, passados 2 minutos do início, o aluno tem dificuldade para entrar.$n$)
WHERE id = 'aeb7593b-a68d-4361-b43c-c26a7bde0c91';

UPDATE welcome_path_questoes SET
  opcoes = replace(opcoes::text, $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$)::jsonb,
  explicacao = replace(explicacao, $o$Resumo Consolidado$o$, $n$Resumo financeiro$n$)
WHERE id = 'ac055744-6b55-4b0d-8d91-52538ef49b80';

-- ─── Títulos sem número de etapa ─────────────────────────────────────────
-- Com os módulos novos, a posição das etapas muda; o número fica só na tela.
UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $o$Resumo da Etapa 3 – $o$, $n$Resumo da etapa – $n$)
WHERE id = '98887440-bd68-445d-977f-db070aca9ee2';
UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $o$Resumo da Etapa 4 – $o$, $n$Resumo da etapa – $n$)
WHERE id = '558f70e8-d921-40ec-baa5-d0edb1950aa8';
UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $o$Resumo da Etapa 5 – $o$, $n$Resumo da etapa – $n$)
WHERE id = '798a557d-084e-42c5-988e-1328b53d9e39';
UPDATE welcome_path_blocos SET conteudo = replace(conteudo, $o$Resumo da Etapa 6 – $o$, $n$Resumo da etapa – $n$)
WHERE id = 'e3753a1d-6eb1-41aa-92c3-e675828daaef';

-- Conferência antes do COMMIT: nenhuma linha destas etapas deve sobrar com os termos antigos
SELECT e.ordem AS etapa, 'bloco' AS onde, b.ordem, left(b.conteudo, 90) AS trecho
FROM welcome_path_blocos b JOIN welcome_path_etapas e ON e.id = b.etapa_id
WHERE e.ordem IN (3, 4, 6, 7)
  AND b.conteudo ~* '(no grupo|Resumo Consolidado|primeiros 5 minutos|instruções do próprio link|Resumo da Etapa [0-9])'
UNION ALL
SELECT e.ordem, 'questão', q.ordem, left(q.enunciado, 90)
FROM welcome_path_questoes q JOIN welcome_path_etapas e ON e.id = q.etapa_id
WHERE e.ordem IN (3, 4, 6, 7)
  AND (q.enunciado || q.opcoes::text || coalesce(q.explicacao, '')) ~* '(no grupo|Resumo Consolidado|primeiros 5 minutos|19h05)';

COMMIT;

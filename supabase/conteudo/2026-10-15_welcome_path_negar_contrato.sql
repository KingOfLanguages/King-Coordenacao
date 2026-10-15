-- Welcome Path · regra de negar contrato (correção do João em 15/10/2026).
-- Negar UM contrato não trava a agenda. O que trava é negar vários contratos
-- seguidos sem motivo; 2 ou 3 negados no mesmo mês, principalmente por não poder
-- dar a primeira aula, não travam. A trilha dizia que negar um contrato "tranca a
-- agenda automaticamente" em três lugares ativos:
--   "Sua agenda"      bloco 16 (texto "5 – Agenda travada") e a questão 0 (explicação)
--   "Primeiro Contato" bloco 7
-- As práticas mudam em public/welcome-path/etapa2-recebendo-alunos.html (?parte=portas)
-- e simulador-plataforma.html.
-- Aplicar com: supabase db query --linked -f <este arquivo>  (NUNCA db push)
-- Desfazer: trocar de volta os pares de texto abaixo (o antigo está no 1º argumento).

BEGIN;

UPDATE welcome_path_blocos
SET conteudo = replace(conteudo,
  'quando você nega um contrato, quando falta à primeira aula de um aluno ou a pedido seu numa emergência.',
  'quando você nega vários contratos seguidos sem motivo, quando falta à primeira aula de um aluno ou a pedido seu numa emergência. Negar um contrato porque a primeira aula não cabe na data não trava.')
WHERE id = '8fa8c1f1-b11a-4a9b-89c1-12b702fd3d07';

UPDATE welcome_path_questoes
SET explicacao = replace(explicacao,
  'Recusar um contrato que caiu na agenda trava a agenda.',
  'E negar contrato atrás de contrato, sem motivo, trava a agenda.')
WHERE id = '6832ce1e-7dc0-42ce-a300-955c3950dfa9';

UPDATE welcome_path_blocos
SET conteudo = replace(conteudo,
  'Lembre-se: negar o recebimento tranca a agenda automaticamente, e só a coordenação destrava.',
  'Se não conseguir dar a primeira aula na data, negue: negar com motivo não trava a agenda. O que trava é negar vários contratos seguidos, sem motivo.')
WHERE id = 'ee27ed23-2d4d-4a30-a0a2-adbac4b47f8e';

-- Trava: se algum replace não pegou (texto editado em prod), desfaz tudo.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM welcome_path_blocos WHERE conteudo ILIKE '%tranca a agenda%' OR conteudo ILIKE '%nega um contrato,%')
     OR EXISTS (SELECT 1 FROM welcome_path_questoes WHERE explicacao ILIKE '%Recusar um contrato que caiu na agenda trava%') THEN
    RAISE EXCEPTION 'A regra antiga ainda aparece: o texto em prod mudou, revisar antes de aplicar.';
  END IF;
  IF (SELECT count(*) FROM welcome_path_blocos
      WHERE id IN ('8fa8c1f1-b11a-4a9b-89c1-12b702fd3d07', 'ee27ed23-2d4d-4a30-a0a2-adbac4b47f8e')
        AND conteudo ILIKE '%seguidos%sem motivo%') <> 2
     OR NOT EXISTS (SELECT 1 FROM welcome_path_questoes
      WHERE id = '6832ce1e-7dc0-42ce-a300-955c3950dfa9' AND explicacao ILIKE '%sem motivo, trava a agenda.%') THEN
    RAISE EXCEPTION 'Esperava os 3 textos com a regra nova.';
  END IF;
END $$;

COMMIT;

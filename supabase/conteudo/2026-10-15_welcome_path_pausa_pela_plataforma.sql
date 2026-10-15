-- Welcome Path · módulo "Pausas, feriados e fim de ano" (ativo, ordem 15 em 15/10/2026).
-- O formulário de pausa do KTM (/pausa) foi aposentado em 14/10/2026: a pausa do
-- professor agora é pedida na plataforma da King, aba Histórico do Aluno → botão
-- Solicitar pausa, no cartão do topo da tela (MAPA 8 corrigido no mesmo dia).
-- Troca só as frases que citavam o formulário, nos dois blocos onde ele aparece:
--   bloco 11 (texto "3 – Pausas") e bloco 16 (lista "Objetivo desta etapa").
-- A volta segue o MAPA 8: o professor fala com a coordenação para reabrir a agenda
-- (antes: "No fim previsto, a coordenação procura você", que dependia do formulário).
-- O texto da prática (embed) muda em public/welcome-path/etapa-pausas-feriados.html.
-- Aplicar com: supabase db query --linked -f <este arquivo>  (NUNCA db push)

BEGIN;

UPDATE welcome_path_blocos
SET conteudo = replace(replace(conteudo,
  'A sua pausa: fale com a coordenação e preencha o formulário de pausa, com o motivo, o último dia de aula e o fim previsto.',
  'A sua pausa: peça direto na plataforma da King, na aba Histórico do Aluno, pelo botão Solicitar pausa, no cartão do topo da tela.'),
  'No fim previsto, a coordenação procura você para reabrir a agenda.',
  'Quando quiser voltar, fale com a coordenação para reabrir a agenda.')
WHERE id = '56ee0095-635e-45f4-800e-5d78dd887b9b'
  AND etapa_id = 'd20c952d-0a0d-40dd-b612-1ca4ca9c9897';

UPDATE welcome_path_blocos
SET conteudo = replace(conteudo,
  'Pedir a sua pausa pelo formulário, com o motivo, o último dia de aula e o fim previsto.',
  'Pedir a sua pausa na plataforma da King: Histórico do Aluno, botão Solicitar pausa.')
WHERE id = '06b9998a-6e56-4148-a026-fed19e3b2b21'
  AND etapa_id = 'd20c952d-0a0d-40dd-b612-1ca4ca9c9897';

-- Trava: se o texto em prod tiver sido editado e o replace não pegou, desfaz tudo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM welcome_path_blocos
    WHERE etapa_id = 'd20c952d-0a0d-40dd-b612-1ca4ca9c9897'
      AND (conteudo ILIKE '%formulário%' OR conteudo ILIKE '%fim previsto%')
  ) THEN
    RAISE EXCEPTION 'O módulo ainda cita o formulário de pausa: o texto em prod mudou, revisar antes de aplicar.';
  END IF;
  IF (SELECT count(*) FROM welcome_path_blocos
      WHERE etapa_id = 'd20c952d-0a0d-40dd-b612-1ca4ca9c9897'
        AND conteudo ILIKE '%Solicitar pausa%') <> 2 THEN
    RAISE EXCEPTION 'Esperava 2 blocos com "Solicitar pausa".';
  END IF;
END $$;

COMMIT;

-- Conferência (rodar depois, em separado):
-- SELECT ordem, tipo, conteudo FROM welcome_path_blocos
-- WHERE etapa_id = 'd20c952d-0a0d-40dd-b612-1ca4ca9c9897' AND ordem IN (11, 16) ORDER BY ordem;

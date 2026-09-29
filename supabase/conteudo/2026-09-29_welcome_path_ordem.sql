-- Ordem da trilha com os 8 módulos novos (Welcome Path 2.0), aplicada depois dos
-- 8 INSERTs das etapas novas (que entram no fim, desativadas).
--   Fase 1 · antes do primeiro aluno: 1 Boas-vindas, 2 A King por dentro,
--     3 Sua agenda, 4 Recebendo alunos, 5 Primeiro Contato, 6 Primeira aula.
--   Fase 2 · primeiro mês: 7 Em sala, 8 Boas Práticas, 9 Metodologia King,
--     10 Avaliação e troca de nível, 11 Seu XP, 12 Como calcular pagamento,
--     13 Pausas, feriados e fim de ano, 14 Aulas experimentais, 15 Encerramento.
-- As 7 etapas ativas mantêm a mesma sequência entre si, então nada muda para
-- quem está na trilha enquanto as novas estiverem desativadas. O número que o
-- professor vê é a posição entre as etapas ativas (TrilhaView/EtapaView), não
-- a coluna `ordem`. `ordem` não tem UNIQUE, então um UPDATE só basta.

BEGIN;

WITH alvo(chave, nova_ordem) AS (VALUES
  ('da5d27ed-f85c-480d-a6a4-0411e6e8eef6', 1),   -- Boas-vindas
  ('A King por dentro', 2),
  ('Sua agenda', 3),
  ('d16d0bd1-faff-44a2-a658-0b3cb10476be', 4),   -- Recebendo alunos
  ('3d95ce54-4c6a-45fe-9160-f072d3a6e55f', 5),   -- Primeiro Contato
  ('f7dd68d3-ad85-4c63-be26-70801611f892', 6),   -- Primeira aula
  ('Em sala', 7),
  ('033f205f-fd65-4211-96e6-c82b80dc52a9', 8),   -- Boas Práticas
  ('Metodologia King', 9),
  ('Avaliação e troca de nível', 10),
  ('Seu XP', 11),
  ('7374e623-88ef-4266-8c4d-12e646005e25', 12),  -- Como calcular pagamento
  ('Pausas, feriados e fim de ano', 13),
  ('Aulas experimentais', 14),
  ('b17ff7e4-15c7-4cde-89d9-22f8be0723dc', 15)   -- Encerramento
)
UPDATE welcome_path_etapas e
SET ordem = a.nova_ordem
FROM alvo a
WHERE e.id::text = a.chave
   OR (e.titulo = a.chave AND e.ativa = false);

-- Conferência antes do COMMIT: 15 linhas, ordem 1 a 15, sem repetição
SELECT ordem, titulo, ativa::text FROM welcome_path_etapas ORDER BY ordem;

COMMIT;

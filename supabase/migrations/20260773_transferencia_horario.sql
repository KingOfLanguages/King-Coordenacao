-- ─────────────────────────────────────────────────────────────────────────────
-- Horário das aulas no pedido de transferência (2026-08-28).
--
-- O pedido dizia POR QUE o aluno precisa sair, mas não dizia QUANDO ele tem
-- aula. E é justamente o horário que decide para quem o aluno pode ir: quem
-- atende a fila abria o pedido, ligava para o professor só para perguntar o
-- dia e a hora, e só então começava a procurar o próximo professor. Uma volta
-- inteira de atendimento por uma informação que o professor tinha na mão na
-- hora de preencher.
--
-- Além do horário atual, perguntamos se o ALUNO quer mudar de horário. Sem
-- isso, o suporte procura vaga no mesmo slot e depois descobre que o aluno
-- queria outro — e a busca recomeça do zero.
--
-- Colunas anuláveis porque os pedidos abertos antes desta migration não têm
-- como responder. O formulário exige as duas primeiras a partir de agora.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transferencias_aluno
  ADD COLUMN IF NOT EXISTS horario_atual      TEXT,
  ADD COLUMN IF NOT EXISTS quer_mudar_horario BOOLEAN,
  ADD COLUMN IF NOT EXISTS horario_desejado   TEXT;

COMMENT ON COLUMN transferencias_aluno.horario_atual IS
  'Dias e horários em que o aluno tem aula com este professor hoje, como o professor descreveu. Texto livre: a agenda real vive na plataforma do King, aqui é o que orienta a busca do próximo professor.';
COMMENT ON COLUMN transferencias_aluno.quer_mudar_horario IS
  'O ALUNO quer trocar de horário junto com a troca de professor. NULL = pedido anterior a 2026-08-28, ninguém perguntou.';
COMMENT ON COLUMN transferencias_aluno.horario_desejado IS
  'Horário que o aluno quer passar a ter. Só preenchido quando quer_mudar_horario = true.';

-- "Quer mudar" sem dizer para quando não ajuda ninguém — é o mesmo que não ter
-- perguntado. NULL e false continuam livres (pedidos antigos, e quem mantém o
-- horário não tem o que preencher).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'transf_horario_desejado_quando_muda'
  ) THEN
    ALTER TABLE transferencias_aluno
      ADD CONSTRAINT transf_horario_desejado_quando_muda
      CHECK (quer_mudar_horario IS NOT TRUE OR btrim(COALESCE(horario_desejado, '')) <> '');
  END IF;
END $$;

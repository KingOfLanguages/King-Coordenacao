-- ─────────────────────────────────────────────────────────────────────────────
-- Reidrata professor_emails a partir do e-mail canônico do cadastro.
--
-- O backfill de 20260629 rodou UMA vez. Desde então o kms-api-sync passou a
-- manter `professores.email` (via `perfil.email` da API do King), e nada
-- levava esse e-mail para `professor_emails`. Como os portais públicos
-- identificavam o professor SÓ por professor_emails, todo professor cujo
-- e-mail chegou depois de 29/06 respondia "não encontramos esse e-mail no
-- cadastro" mesmo digitando o e-mail certo — e era jogado no casamento por
-- nome exato, de longe a parte mais fácil de errar.
--
-- Duas metades:
--   1. Este backfill, que resolve o passivo acumulado.
--   2. Um gatilho, que impede o buraco de reabrir a cada rodada do sync.
--
-- O portal-agendamento-lookup também passou a ler `professores.email` direto,
-- então a identificação não depende desta migration ter rodado — ela é o que
-- mantém as duas fontes coerentes (e serve os outros portais).
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Passivo: e-mails de cadastro que nunca viraram identificador ──────────
-- ON CONFLICT DO NOTHING respeita o índice único em lower(email): se o e-mail
-- já pertence a alguém (inclusive a outro professor), não mexemos.
INSERT INTO professor_emails (professor_id, email, origem)
SELECT p.id, btrim(p.email), 'kms'
FROM professores p
WHERE p.email IS NOT NULL
  AND btrim(p.email) <> ''
  AND p.email LIKE '%@%'
ON CONFLICT DO NOTHING;


-- ── 2. Gatilho: todo e-mail novo vira identificador na hora ──────────────────
CREATE OR REPLACE FUNCTION sincronizar_email_cadastro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL OR btrim(NEW.email) = '' OR NEW.email NOT LIKE '%@%' THEN
    RETURN NEW;
  END IF;

  -- Um e-mail pertence a no máximo um professor (índice único em lower(email)).
  -- Se já está registrado — para este professor ou para outro — não tocamos:
  -- roubar o vínculo de outra pessoa seria pior que não registrar.
  INSERT INTO professor_emails (professor_id, email, origem)
  VALUES (NEW.id, btrim(NEW.email), 'kms')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sincronizar_email_cadastro ON professores;
CREATE TRIGGER trg_sincronizar_email_cadastro
  AFTER INSERT OR UPDATE OF email ON professores
  FOR EACH ROW
  EXECUTE FUNCTION sincronizar_email_cadastro();

COMMENT ON FUNCTION sincronizar_email_cadastro() IS
  'Espelha professores.email em professor_emails (origem kms). Sem isso, e-mail '
  'que chega pelo kms-api-sync nunca vira identificador e o professor não '
  'consegue se identificar nos portais públicos pelo próprio e-mail.';

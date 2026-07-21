-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path: blocos de conteúdo passam a ser ELEMENTOS TIPADOS, no mesmo
-- modelo da área de materiais da King (KMS).
--
-- Motivo: a primeira versão (20260739) tinha um tipo `texto` cujo conteúdo era
-- HTML cru, digitado num textarea. A coordenação não escreve HTML — na
-- plataforma da King ela monta material clicando "adicionar título / parágrafo
-- / vídeo / destaque", e cada peça é um elemento com `type` e `content`.
--
-- O contrato do KMS (documentado no briefing do King Material Injector) é:
--   material → blocks[] → elements[] { id, type, content, position, metadata }
--   type ∈ h1 | h2 | text | video | callout
--   callout: metadata.calloutVariant ∈ info (azul) | warning (amarelo)
--   video:   metadata.videoUrl
--
-- Aqui a etapa já faz o papel do "block", então ficamos com um nível só de
-- elementos — mas com as MESMAS chaves de tipo, para que o conteúdo possa
-- transitar entre os dois lados sem tradutor.
--
-- Extras nossos, que o KMS não tem:
--   imagem — a trilha usa print de tela o tempo todo;
--   html   — escotilha de fuga para o conteúdo herdado do app antigo, que já
--            veio escrito em HTML (tabelas, caixas de alerta montadas à mão).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE welcome_path_blocos DROP CONSTRAINT IF EXISTS welcome_path_blocos_tipo_check;

-- O tipo antigo `texto` sempre carregou HTML; vira `html`. `aviso` vira o
-- `callout` do KMS, com a variante em meta.
UPDATE welcome_path_blocos SET tipo = 'html'    WHERE tipo = 'texto';
UPDATE welcome_path_blocos SET tipo = 'callout' WHERE tipo = 'aviso';

-- meta.tom (nosso) → meta.calloutVariant (do KMS).
UPDATE welcome_path_blocos
   SET meta = (meta - 'tom') || jsonb_build_object(
         'calloutVariant',
         CASE meta->>'tom'
           WHEN 'dica'    THEN 'info'
           WHEN 'atencao' THEN 'warning'
           ELSE 'danger'
         END)
 WHERE tipo = 'callout' AND meta ? 'tom';

ALTER TABLE welcome_path_blocos ADD CONSTRAINT welcome_path_blocos_tipo_check
  CHECK (tipo IN ('h1', 'h2', 'text', 'video', 'imagem', 'callout', 'html'));

COMMENT ON COLUMN welcome_path_blocos.tipo IS
  'Tipo do elemento. h1/h2/text/video/callout espelham a área de materiais da King (KMS); imagem e html são extensões nossas.';
COMMENT ON COLUMN welcome_path_blocos.conteudo IS
  'Texto do elemento (h1/h2/text/callout), HTML cru (html) ou legenda (imagem).';
COMMENT ON COLUMN welcome_path_blocos.meta IS
  'Extras por tipo: {"calloutVariant":"info|warning|danger"} no callout.';

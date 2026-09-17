-- ─────────────────────────────────────────────────────────────────────────────
-- Tipo de elemento `embed`: uma página interativa nossa dentro da etapa, num
-- iframe isolado.
--
-- Motivo: a calculadora de pagamento da etapa "Como calcular pagamento" é uma
-- página com script próprio. O tipo `html` que já existia não serve para isso —
-- ele renderiza por dangerouslySetInnerHTML (ver Blocos.tsx), e o navegador NÃO
-- executa <script> inserido por innerHTML. Pior: o <style> É aplicado, e uma
-- página com `:root{…}` repinta a plataforma inteira. Daí um tipo próprio, com
-- iframe sandbox, em vez de esticar o `html`.
--
-- A `url` aponta para um arquivo servido pelo próprio app (public/welcome-path/).
-- O editor restringe a caminhos que começam com `/`: o bloco existe para as
-- nossas páginas, não para virar iframe aberto para qualquer site.
--
-- A Edge Function `portal-welcome-path` não muda: a ação `etapa` seleciona
-- (id, ordem, tipo, titulo, conteudo, url, meta) sem filtrar por tipo, então o
-- tipo novo flui para o professor sozinho.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE welcome_path_blocos DROP CONSTRAINT IF EXISTS welcome_path_blocos_tipo_check;
ALTER TABLE welcome_path_blocos ADD CONSTRAINT welcome_path_blocos_tipo_check
  CHECK (tipo IN (
    'h1', 'h2', 'text', 'video', 'imagem', 'callout', 'html',
    'lista', 'divisor', 'botao', 'citacao', 'galeria', 'embed'
  ));

COMMENT ON COLUMN welcome_path_blocos.tipo IS
  'Tipo do elemento. h1/h2/text/video/callout espelham a área de materiais da King (KMS); imagem, html, lista, divisor, botao, citacao, galeria e embed são extensões nossas.';

COMMENT ON COLUMN welcome_path_blocos.meta IS
  'Extras por tipo: {"calloutVariant":…} no callout, {"ordered":bool} na lista, {"estilo":…} no botao/divisor, {"imagens":[{"url","legenda"}],"colunas":2|3} na galeria, {"altura":<px inicial>} no embed.';

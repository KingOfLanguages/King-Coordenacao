-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path — upgrade da AUTORIA de conteúdo.
--
-- Três frentes, todas do lado da coordenação que monta a trilha:
--
--   1. Mais TIPOS de elemento: lista, divisor, botao e citacao. O vocabulário
--      antigo (título/parágrafo/vídeo/imagem/destaque/html) cobria texto, mas
--      não dava para montar uma lista de passos, separar seções, jogar um botão
--      de "acesse a planilha" ou destacar uma citação sem cair no HTML cru.
--
--   2. UPLOAD de imagem: até aqui o bloco de imagem só aceitava colar uma URL,
--      o que obriga a coordenação a hospedar o print em outro lugar antes. Passa
--      a existir um bucket próprio (welcome-path) para enviar o arquivo direto.
--
--   3. INSERIR bloco em qualquer posição: o editor só sabia acrescentar no fim e
--      subir de um em um. wp_inserir_bloco abre espaço e insere onde a pessoa
--      quiser — e o mesmo caminho serve o "duplicar" (inserir logo abaixo com o
--      conteúdo copiado).
--
-- A Edge Function do portal (portal-welcome-path) lê os blocos genericamente
-- (id, ordem, tipo, titulo, conteudo, url, meta) e não filtra por tipo, então os
-- tipos novos fluem para o professor sem tocar nela.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Novos tipos de elemento ───────────────────────────────────────────────

ALTER TABLE welcome_path_blocos DROP CONSTRAINT IF EXISTS welcome_path_blocos_tipo_check;
ALTER TABLE welcome_path_blocos ADD CONSTRAINT welcome_path_blocos_tipo_check
  CHECK (tipo IN (
    'h1', 'h2', 'text', 'video', 'imagem', 'callout', 'html',
    'lista', 'divisor', 'botao', 'citacao'
  ));

COMMENT ON COLUMN welcome_path_blocos.tipo IS
  'Tipo do elemento. h1/h2/text/video/callout espelham a área de materiais da King (KMS); imagem, html, lista, divisor, botao e citacao são extensões nossas.';
COMMENT ON COLUMN welcome_path_blocos.conteudo IS
  'Texto do elemento (h1/h2/text/callout/citacao), um item por linha (lista), HTML cru (html) ou legenda (imagem).';
COMMENT ON COLUMN welcome_path_blocos.meta IS
  'Extras por tipo: {"calloutVariant":"info|warning|danger"} no callout, {"ordered":bool} na lista, {"estilo":…} no botao e no divisor.';


-- ── 2. Bucket de imagens do Welcome Path ─────────────────────────────────────
-- Mesma régua do bucket de incidentes (20260714): leitura pública (a imagem é
-- renderizada direto pela URL no portal do professor, sem sessão), escrita e
-- remoção só para quem edita a trilha — coordenação e admin (pode_gerir_welcome_path).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'welcome-path',
  'welcome-path',
  true,
  8388608, -- 8 MiB por arquivo (print/foto de material)
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública (o bucket já é public; a policy deixa explícito).
drop policy if exists "wp_img_read" on storage.objects;
create policy "wp_img_read" on storage.objects
  for select to public
  using (bucket_id = 'welcome-path');

-- Upload só para quem gere a trilha.
drop policy if exists "wp_img_write" on storage.objects;
create policy "wp_img_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'welcome-path' and pode_gerir_welcome_path());

-- Remoção só para quem gere a trilha (troca/limpeza de imagem).
drop policy if exists "wp_img_delete" on storage.objects;
create policy "wp_img_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'welcome-path' and pode_gerir_welcome_path());


-- ── 3. Inserir bloco em posição arbitrária ───────────────────────────────────
-- Um caminho só para "adicionar aqui" e "duplicar": abre espaço empurrando tudo
-- daquela posição pra frente uma casa e insere no vão. Como `ordem` não tem
-- UNIQUE (ver 20260739), o shift é um UPDATE relativo simples — algo que o
-- cliente supabase-js não faz sozinho, por isso vive numa RPC.
--
-- SECURITY DEFINER + checagem explícita de permissão, no mesmo molde de
-- wp_mover_etapa. Devolve o id do bloco novo para o front focar/editar.

create or replace function wp_inserir_bloco(
  p_etapa_id uuid,
  p_posicao  integer,
  p_tipo     text,
  p_titulo   text  default null,
  p_conteudo text  default null,
  p_url      text  default null,
  p_meta     jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not pode_gerir_welcome_path() then
    raise exception 'Sem permissão para editar a trilha.';
  end if;

  update welcome_path_blocos
     set ordem = ordem + 1
   where etapa_id = p_etapa_id
     and ordem   >= p_posicao;

  insert into welcome_path_blocos (etapa_id, ordem, tipo, titulo, conteudo, url, meta)
  values (p_etapa_id, p_posicao, p_tipo, p_titulo, p_conteudo, p_url, coalesce(p_meta, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function wp_inserir_bloco(uuid, integer, text, text, text, text, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Welcome Path — 2ª leva do upgrade de autoria de conteúdo.
--
--   1. Tipo novo `galeria`: várias imagens lado a lado (2 ou 3 colunas). As
--      imagens ficam em meta.imagens [{url, legenda?}] — um bloco só, em grade.
--
--   2. UPLOAD de vídeo: o bloco de vídeo já aceitava link do YouTube/Vimeo/mp4;
--      agora dá pra enviar o arquivo direto (bucket welcome-path-video). O
--      videoEmbed reconhece a URL .mp4/.webm/.ogg e o portal renderiza num
--      <video> nativo — mesmo caminho de um link de arquivo colado.
--
--   3. REORDENAR arrastando: wp_reordenar_blocos grava a ordem inteira de uma vez
--      (ordem = posição no array), atômico. É o que sustenta o drag-and-drop —
--      as setinhas de subir/descer continuam, mas agora dá pra jogar o bloco
--      direto no lugar.
-- ─────────────────────────────────────────────────────────────────────────────


-- ── 1. Tipo `galeria` ────────────────────────────────────────────────────────

ALTER TABLE welcome_path_blocos DROP CONSTRAINT IF EXISTS welcome_path_blocos_tipo_check;
ALTER TABLE welcome_path_blocos ADD CONSTRAINT welcome_path_blocos_tipo_check
  CHECK (tipo IN (
    'h1', 'h2', 'text', 'video', 'imagem', 'callout', 'html',
    'lista', 'divisor', 'botao', 'citacao', 'galeria'
  ));

COMMENT ON COLUMN welcome_path_blocos.meta IS
  'Extras por tipo: {"calloutVariant":…} no callout, {"ordered":bool} na lista, {"estilo":…} no botao/divisor, {"imagens":[{"url","legenda"}],"colunas":2|3} na galeria.';


-- ── 2. Bucket de vídeos do Welcome Path ──────────────────────────────────────
-- Separado do bucket de imagens porque o teto de tamanho é outro. 50 MiB cobre
-- clipe curto de onboarding; vídeo longo continua indo por link do YouTube.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'welcome-path-video',
  'welcome-path-video',
  true,
  52428800, -- 50 MiB
  array['video/mp4', 'video/webm', 'video/ogg']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "wpv_read" on storage.objects;
create policy "wpv_read" on storage.objects
  for select to public
  using (bucket_id = 'welcome-path-video');

drop policy if exists "wpv_write" on storage.objects;
create policy "wpv_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'welcome-path-video' and pode_gerir_welcome_path());

drop policy if exists "wpv_delete" on storage.objects;
create policy "wpv_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'welcome-path-video' and pode_gerir_welcome_path());


-- ── 3. Reordenar blocos de uma vez ───────────────────────────────────────────
-- Recebe os ids na ordem desejada e grava ordem = posição (0-based). Só mexe nos
-- blocos da própria etapa. Atômico, para o drag-and-drop não deixar a lista num
-- estado intermediário.

create or replace function wp_reordenar_blocos(p_etapa_id uuid, p_ids uuid[])
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not pode_gerir_welcome_path() then
    raise exception 'Sem permissão para reordenar blocos.';
  end if;

  update welcome_path_blocos b
     set ordem = pos.idx
    from (
      select id, (ordinality - 1)::int as idx
        from unnest(p_ids) with ordinality as t(id, ordinality)
    ) pos
   where b.id = pos.id
     and b.etapa_id = p_etapa_id;
end;
$$;

grant execute on function wp_reordenar_blocos(uuid, uuid[]) to authenticated;

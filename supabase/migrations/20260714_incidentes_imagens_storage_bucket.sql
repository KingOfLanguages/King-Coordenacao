-- ─────────────────────────────────────────────────────────────────────────────
-- Bucket de imagens anexadas a incidentes (nexus_incidents.image_urls).
-- A coluna image_urls já existia (gravada como []). Faltava onde guardar os
-- arquivos: este bucket. Leitura pública (renderização direta pela URL),
-- escrita/remoção só para usuários internos autenticados — mesma régua de acesso
-- de quem registra incidentes.
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'incidentes',
  'incidentes',
  true,
  5242880, -- 5 MiB por arquivo
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Leitura pública (o bucket já é public; a policy deixa explícito).
drop policy if exists "incidentes_img_read" on storage.objects;
create policy "incidentes_img_read" on storage.objects
  for select to public
  using (bucket_id = 'incidentes');

-- Upload só para internos autenticados.
drop policy if exists "incidentes_img_write" on storage.objects;
create policy "incidentes_img_write" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'incidentes');

-- Remoção só para internos autenticados (limpeza de anexos).
drop policy if exists "incidentes_img_delete" on storage.objects;
create policy "incidentes_img_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'incidentes');

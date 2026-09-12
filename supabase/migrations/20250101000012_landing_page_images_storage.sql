-- Bucket for landing page product images. Public read (published pages are
-- shown to anonymous buyers), write restricted to the owning merchant's own
-- folder (path convention: "<merchant_id>/<file>").
insert into storage.buckets (id, name, public)
values ('landing-page-images', 'landing-page-images', true)
on conflict (id) do nothing;

create policy "landing_page_images_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'landing-page-images');

create policy "landing_page_images_owner_write"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'landing-page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "landing_page_images_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'landing-page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'landing-page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "landing_page_images_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'landing-page-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

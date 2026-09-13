-- The shipping settings page is back (restored after it turned out
-- ibrahimcamera.dz@gmail.com never actually had a row here, which broke
-- every order with "Adresse d'expédition du marchand non configurée"). It
-- now always writes to the canonical merchant id, which differs from
-- auth.uid() when yahiaoui.aghiles@gmail.com submits the form, so the write
-- policies need the same admin bypass already granted on landing_pages/orders.
drop policy "shipping_settings_insert_own" on public.shipping_settings;
create policy "shipping_settings_insert_own_or_admin"
  on public.shipping_settings for insert
  to authenticated
  with check (merchant_id = auth.uid() or public.is_admin());

drop policy "shipping_settings_update_own" on public.shipping_settings;
create policy "shipping_settings_update_own_or_admin"
  on public.shipping_settings for update
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin())
  with check (merchant_id = auth.uid() or public.is_admin());

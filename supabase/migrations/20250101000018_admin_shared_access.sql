-- The app now has exactly two operators sharing one business (registration
-- is closed in the dashboard, no more self-signup). Promote every existing
-- profile to 'admin' and let admins fully manage (not just view) each
-- other's merchant-scoped rows, so both operators work off the same data
-- regardless of which of the two accounts a row happens to belong to.
update public.profiles set role = 'admin';

drop policy "landing_pages_insert_own" on public.landing_pages;
create policy "landing_pages_insert_own_or_admin"
  on public.landing_pages for insert
  to authenticated
  with check (merchant_id = auth.uid() or public.is_admin());

drop policy "landing_pages_update_own" on public.landing_pages;
create policy "landing_pages_update_own_or_admin"
  on public.landing_pages for update
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin())
  with check (merchant_id = auth.uid() or public.is_admin());

drop policy "landing_pages_delete_own" on public.landing_pages;
create policy "landing_pages_delete_own_or_admin"
  on public.landing_pages for delete
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

drop policy "orders_update_own" on public.orders;
create policy "orders_update_own_or_admin"
  on public.orders for update
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin())
  with check ((merchant_id = auth.uid() or public.is_admin()) and status in ('confirmed', 'cancelled'));

drop policy "orders_delete_own" on public.orders;
create policy "orders_delete_own_or_admin"
  on public.orders for delete
  to authenticated
  using (
    (merchant_id = auth.uid() or public.is_admin())
    and not exists (select 1 from public.shipments s where s.order_id = orders.id)
  );

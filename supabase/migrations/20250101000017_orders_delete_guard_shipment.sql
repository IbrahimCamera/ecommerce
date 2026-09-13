-- Tighten orders_delete_own: base the guard on the actual existence of a
-- shipments row (proof a Yalidine parcel exists) instead of status = 'pushed'.
-- pushOrdersToYalidine inserts the shipments row before flipping the order to
-- 'pushed', so a crash in that narrow window could otherwise leave a
-- Yalidine-shipped order at status 'confirmed' and deletable.
drop policy "orders_delete_own" on public.orders;

create policy "orders_delete_own"
  on public.orders for delete
  to authenticated
  using (
    merchant_id = auth.uid()
    and not exists (select 1 from public.shipments s where s.order_id = orders.id)
  );

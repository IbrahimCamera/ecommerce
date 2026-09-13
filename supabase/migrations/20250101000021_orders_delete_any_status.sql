-- The merchant/admin wants to be able to delete any order from the app
-- regardless of status, including ones already pushed to Yalidine. This is a
-- purely local deletion (no Yalidine API call), so it only removes our own
-- record of the order/shipment; the real parcel at Yalidine is untouched.
drop policy "orders_delete_own_or_admin" on public.orders;

create policy "orders_delete_own_or_admin"
  on public.orders for delete
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

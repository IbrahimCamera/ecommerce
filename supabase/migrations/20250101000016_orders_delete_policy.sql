-- Allow a merchant to permanently delete their own orders, as long as the
-- order hasn't actually been pushed to Yalidine yet (a real shipment/tracking
-- number exists at that point, so deleting the local row would lose the
-- record of it). Cascades to shipments/shipment_events via existing FKs,
-- which is fine here since a 'pushed' order can never reach this policy.
create policy "orders_delete_own"
  on public.orders for delete
  to authenticated
  using (merchant_id = auth.uid() and status <> 'pushed');

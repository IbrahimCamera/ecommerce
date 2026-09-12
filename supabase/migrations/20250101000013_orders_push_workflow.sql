-- Auto-push setting: when enabled, create-order confirms and pushes to
-- Yalidine immediately instead of waiting for the merchant to confirm.
alter table public.shipping_settings
  add column auto_push_enabled boolean not null default false;

-- Tighten the merchant's own UPDATE policy: from the dashboard (authenticated
-- client, not service role) an order's status may only move to 'confirmed'
-- or 'cancelled'. 'pushed' and 'failed' are only ever set by push-to-yalidine
-- (service role), which bypasses RLS entirely — this stops a client from
-- marking an order as pushed without an actual shipment existing.
drop policy "orders_update_own" on public.orders;

create policy "orders_update_own"
  on public.orders for update
  to authenticated
  using (merchant_id = auth.uid())
  with check (merchant_id = auth.uid() and status in ('confirmed', 'cancelled'));

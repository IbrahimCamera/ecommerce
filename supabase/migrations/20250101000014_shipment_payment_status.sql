-- Yalidine's own payment_status enum (Parcels docs): not-ready, ready,
-- receivable, payed. Populated by sync-payment-status (merchant-triggered)
-- until the Lot 4 webhook (parcel_payment_updated) can push it in real time.
alter table public.shipments
  add column payment_status text check (payment_status in ('not-ready', 'ready', 'receivable', 'payed')),
  add column payment_id text;

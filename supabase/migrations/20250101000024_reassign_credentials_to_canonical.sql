-- Migration 19 (canonical_merchant) reassigned landing_pages and orders to
-- the canonical merchant but missed yalidine_credentials: the working API
-- keys were still sitting under the old (pre-canonical) merchant record,
-- so the canonical merchant that every landing page/order actually
-- references had no credentials, and the daily fee sync (which only syncs
-- merchants with active credentials) never populated delivery fees for it —
-- hence "Tarifs de livraison indisponibles" for every wilaya/commune.
update public.yalidine_credentials
set merchant_id = public.canonical_merchant_id()
where merchant_id <> public.canonical_merchant_id();

-- Drop the now-orphaned duplicate shipping_settings row left under the old
-- merchant (superseded by the canonical merchant's own row).
delete from public.shipping_settings
where merchant_id <> public.canonical_merchant_id();

-- Drop delivery-fee cache rows synced under the old (now credential-less)
-- merchant — no landing page or order references it, so this data can only
-- ever go stale. A fresh sync run repopulates the canonical merchant's own
-- cache from scratch.
delete from public.yalidine_delivery_fees
where merchant_id <> public.canonical_merchant_id();

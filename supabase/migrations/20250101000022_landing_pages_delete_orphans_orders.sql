-- Allow deleting a landing page even when orders reference it: orders are
-- historical records (and may already have a real Yalidine shipment behind
-- them), so deleting the page must not delete or block deleting them. The
-- order simply loses its landing_page_id link instead.
alter table public.orders alter column landing_page_id drop not null;

alter table public.orders drop constraint orders_landing_page_id_fkey;

alter table public.orders
  add constraint orders_landing_page_id_fkey
  foreign key (landing_page_id) references public.landing_pages (id) on delete set null;

-- New landing_pages status so a merchant can mark a product out of stock
-- without unpublishing the page entirely: the public page still shows
-- (so buyers who already have the link see why they can't order) but
-- create-order only accepts orders for status = 'published', so no new
-- order can be taken while out of stock.
alter table public.landing_pages drop constraint landing_pages_status_check;

alter table public.landing_pages
  add constraint landing_pages_status_check
  check (status in ('draft', 'published', 'out_of_stock'));

drop policy "landing_pages_select_published_anon" on public.landing_pages;
create policy "landing_pages_select_published_anon"
  on public.landing_pages for select
  to anon
  using (status in ('published', 'out_of_stock'));

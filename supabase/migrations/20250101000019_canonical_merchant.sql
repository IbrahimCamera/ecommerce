-- With registration closed and both operators sharing one business, there is
-- now exactly one "real" merchant record (Yalidine credentials + shipping
-- settings are already configured under ibrahimcamera.dz@gmail.com). Rather
-- than hardcode that UUID in frontend/edge-function source, expose it via a
-- single function so it can be looked up by email in one place.
create or replace function public.canonical_merchant_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select id from auth.users where email = 'ibrahimcamera.dz@gmail.com' limit 1;
$$;

revoke all on function public.canonical_merchant_id() from public, anon;
grant execute on function public.canonical_merchant_id() to authenticated, service_role;

-- Reassign any landing pages/orders that ended up under the other admin
-- account (yahiaoui.aghiles@gmail.com) to the canonical merchant, so every
-- order keeps resolving Yalidine credentials/shipping settings correctly
-- regardless of which admin created the page.
update public.landing_pages
set merchant_id = public.canonical_merchant_id()
where merchant_id <> public.canonical_merchant_id();

update public.orders
set merchant_id = public.canonical_merchant_id()
where merchant_id <> public.canonical_merchant_id();

-- Yalidine API credentials. The raw api_id/api_token are NEVER stored in this
-- table (or anywhere else in Postgres) in plaintext: they live only in
-- Supabase Vault, referenced here by opaque secret UUIDs. Decryption is only
-- possible through get_decrypted_yalidine_credentials(), which is callable
-- exclusively by service_role — i.e. only from an Edge Function, never from
-- the browser. api_id_last4 is the only fragment of the key kept in the open,
-- for the masked "****1234" display.

create table public.yalidine_credentials (
  id uuid primary key default gen_random_uuid(),
  merchant_id uuid not null unique references public.profiles (id) on delete cascade,
  api_id_secret_id uuid,
  api_token_secret_id uuid,
  webhook_secret_id uuid,
  api_id_last4 text,
  is_active boolean not null default false,
  last_checked_at timestamptz,
  last_check_status text check (last_check_status in ('ok', 'error')),
  last_check_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.yalidine_credentials enable row level security;

create trigger set_yalidine_credentials_updated_at
  before update on public.yalidine_credentials
  for each row execute function public.set_updated_at();

-- The base table has no secret material, so merchants may read their own row
-- (they only ever see api_id_last4 and the connection status, never the vault
-- secret ids, since the frontend simply won't render those columns).
create policy "yalidine_credentials_select_own_or_admin"
  on public.yalidine_credentials for select
  to authenticated
  using (merchant_id = auth.uid() or public.is_admin());

-- No insert/update/delete policy for authenticated/anon: writes only happen
-- through the SECURITY DEFINER functions below, called by the
-- yalidine-credentials Edge Function using the service role key, after the
-- keys have been tested against the Yalidine API.

-- Creates or rotates a merchant's Yalidine secret pair in Vault and upserts
-- the reference row. Only ever called after a successful test call.
-- Uses Supabase Vault's vault.create_secret/update_secret/decrypted_secrets —
-- verify these signatures against the current Supabase Vault docs if this
-- migration fails, since it's a platform API this project can't pin a version of.
create or replace function public.set_yalidine_credentials(
  p_merchant_id uuid,
  p_api_id text,
  p_api_token text
)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_existing public.yalidine_credentials%rowtype;
begin
  select * into v_existing from public.yalidine_credentials where merchant_id = p_merchant_id;

  if v_existing.id is null then
    insert into public.yalidine_credentials (
      merchant_id, api_id_secret_id, api_token_secret_id, api_id_last4
    ) values (
      p_merchant_id,
      vault.create_secret(p_api_id, 'yalidine_api_id_' || p_merchant_id::text),
      vault.create_secret(p_api_token, 'yalidine_api_token_' || p_merchant_id::text),
      right(p_api_id, 4)
    );
  else
    perform vault.update_secret(v_existing.api_id_secret_id, p_api_id);
    perform vault.update_secret(v_existing.api_token_secret_id, p_api_token);

    update public.yalidine_credentials
    set api_id_last4 = right(p_api_id, 4)
    where merchant_id = p_merchant_id;
  end if;
end;
$$;

revoke all on function public.set_yalidine_credentials(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_yalidine_credentials(uuid, text, text) to service_role;

-- Returns the decrypted api_id/api_token for a merchant. Only callable by
-- service_role, i.e. only from within an Edge Function.
create or replace function public.get_decrypted_yalidine_credentials(p_merchant_id uuid)
returns table (api_id text, api_token text)
language sql
security definer
set search_path = public, vault
as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where id = c.api_id_secret_id),
    (select decrypted_secret from vault.decrypted_secrets where id = c.api_token_secret_id)
  from public.yalidine_credentials c
  where c.merchant_id = p_merchant_id;
$$;

revoke all on function public.get_decrypted_yalidine_credentials(uuid) from public, anon, authenticated;
grant execute on function public.get_decrypted_yalidine_credentials(uuid) to service_role;

-- Upserts the connection test outcome so the dashboard always has a status to
-- show, even before the very first successful save (row may not exist yet).
create or replace function public.record_yalidine_check_result(
  p_merchant_id uuid,
  p_is_active boolean,
  p_status text,
  p_message text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.yalidine_credentials (merchant_id, is_active, last_checked_at, last_check_status, last_check_message)
  values (p_merchant_id, p_is_active, now(), p_status, p_message)
  on conflict (merchant_id) do update
  set is_active = excluded.is_active,
      last_checked_at = excluded.last_checked_at,
      last_check_status = excluded.last_check_status,
      last_check_message = excluded.last_check_message;
$$;

revoke all on function public.record_yalidine_check_result(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.record_yalidine_check_result(uuid, boolean, text, text) to service_role;

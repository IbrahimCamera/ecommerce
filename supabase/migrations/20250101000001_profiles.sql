-- Merchant profiles, one row per auth.users row, plus the is_admin() helper
-- and the generic updated_at trigger reused by later migrations.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  business_name text not null,
  full_name text not null,
  phone text not null,
  role text not null default 'merchant' check (role in ('merchant', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- security definer + fixed search_path so the function can read profiles
-- regardless of the caller's RLS visibility, without being hijacked via a
-- search_path override.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create policy "profiles_select_own_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create the profile row on signup. business_name/full_name/phone are
-- required (NOT NULL, no default) and must be passed as auth signUp metadata
-- by the frontend — we never invent placeholder values here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, business_name, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data ->> 'business_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'phone'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

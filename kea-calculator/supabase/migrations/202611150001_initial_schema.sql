-- Karvan-e-Asal Umrah Calculator — Batch 2 database foundation
-- Apply in a NEW Supabase project's SQL Editor.
-- Security model: authenticated users only; owner/staff roles live in profiles.
-- Do not expose the service_role key in browser code.

create extension if not exists pgcrypto;

-- Authorization helpers stay outside the exposed public API schema.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

do $$ begin
  create type public.app_role as enum ('owner', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.rate_status as enum ('draft', 'active', 'archived');
exception when duplicate_object then null; end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'staff',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rate_versions (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete restrict,
  season text not null check (length(trim(season)) between 1 and 80),
  status public.rate_status not null default 'draft',
  effective_from date,
  effective_to date,
  currency text not null default 'SAR' check (currency in ('SAR','PKR')),
  notes text not null default '',
  source_label text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_from is null or effective_to >= effective_from)
);

-- rates_json preserves each supplier's existing rate shape during migration.
-- Batch 4 will map the calculator's exact room/pricing keys without changing values.
create table if not exists public.hotel_rates (
  id uuid primary key default gen_random_uuid(),
  rate_version_id uuid not null references public.rate_versions(id) on delete cascade,
  city text not null check (city in ('Makkah','Madinah')),
  hotel_name text not null check (length(trim(hotel_name)) between 1 and 200),
  location text not null default '',
  distance_text text not null default '',
  max_occupancy integer check (max_occupancy is null or max_occupancy between 1 and 20),
  rates_json jsonb not null default '{}'::jsonb check (jsonb_typeof(rates_json) = 'object'),
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload) = 'object'),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (rate_version_id, city, hotel_name)
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  phone text not null default '',
  email text not null default '',
  passport_number text not null default '',
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  quotation_no text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text not null default '',
  customer_phone text not null default '',
  status text not null default 'draft' check (status in ('draft','sent','confirmed','cancelled')),
  currency text not null default 'PKR' check (currency in ('PKR','SAR')),
  total_sar numeric(14,2) not null default 0 check (total_sar >= 0),
  total_pkr numeric(14,2) not null default 0 check (total_pkr >= 0),
  calculation_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(calculation_snapshot) = 'object'),
  notes text not null default '',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rate_versions_vendor_status_idx on public.rate_versions(vendor_id, status, effective_from);
create index if not exists hotel_rates_version_city_idx on public.hotel_rates(rate_version_id, city, sort_order);
create index if not exists customers_name_idx on public.customers using gin (to_tsvector('simple', full_name));
create index if not exists customers_phone_idx on public.customers(phone);
create index if not exists quotations_created_at_idx on public.quotations(created_at desc);
create index if not exists quotations_customer_idx on public.quotations(customer_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$ declare t text; begin
  foreach t in array array['profiles','vendors','rate_versions','hotel_rates','customers','quotations'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Create a staff profile automatically for every newly authenticated account.
-- An owner must promote the first account manually using the SQL shown in README.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, role, is_active)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), 'staff', true)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active = true
  );
$$;

create or replace function private.is_owner()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_active = true and p.role = 'owner'
  );
$$;

-- Enable RLS on every application table.
alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.rate_versions enable row level security;
alter table public.hotel_rates enable row level security;
alter table public.customers enable row level security;
alter table public.quotations enable row level security;

-- Profiles: users can read their own profile; owners can manage all profiles.
drop policy if exists profiles_read_self_or_owner on public.profiles;
create policy profiles_read_self_or_owner on public.profiles
for select to authenticated using (id = (select auth.uid()) or (select private.is_owner()));
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
for update to authenticated using ((select private.is_owner()))
with check ((select private.is_owner()));
drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles
for insert to authenticated with check ((select private.is_owner()));

-- Shared reference data: active staff and owners can read; only owners can edit rates.
drop policy if exists vendors_read_active_users on public.vendors;
create policy vendors_read_active_users on public.vendors
for select to authenticated using ((select private.is_active_user()));
drop policy if exists vendors_owner_all on public.vendors;
create policy vendors_owner_all on public.vendors
for all to authenticated using ((select private.is_owner()))
with check ((select private.is_owner()));

drop policy if exists rate_versions_read_active_users on public.rate_versions;
create policy rate_versions_read_active_users on public.rate_versions
for select to authenticated using ((select private.is_active_user()));
drop policy if exists rate_versions_owner_all on public.rate_versions;
create policy rate_versions_owner_all on public.rate_versions
for all to authenticated using ((select private.is_owner()))
with check ((select private.is_owner()));

drop policy if exists hotel_rates_read_active_users on public.hotel_rates;
create policy hotel_rates_read_active_users on public.hotel_rates
for select to authenticated using ((select private.is_active_user()));
drop policy if exists hotel_rates_owner_all on public.hotel_rates;
create policy hotel_rates_owner_all on public.hotel_rates
for all to authenticated using ((select private.is_owner()))
with check ((select private.is_owner()));

-- Office-wide customer and quotation records: active staff can work with them.
drop policy if exists customers_active_users_all on public.customers;
create policy customers_active_users_all on public.customers
for all to authenticated using ((select private.is_active_user()))
with check ((select private.is_active_user()));
drop policy if exists quotations_active_users_all on public.quotations;
create policy quotations_active_users_all on public.quotations
for all to authenticated using ((select private.is_active_user()))
with check ((select private.is_active_user()));

-- Explicitly grant only the table operations needed by the application.
grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.vendors, public.rate_versions, public.hotel_rates to authenticated;
grant select, insert, update, delete on public.customers, public.quotations to authenticated;
revoke all on function private.is_active_user() from public, anon;
revoke all on function private.is_owner() from public, anon;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_owner() to authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

-- First owner bootstrap (run only after creating your first Auth user):
-- update public.profiles
-- set role = 'owner', full_name = 'Business Owner'
-- where id = (select id from auth.users order by created_at asc limit 1);
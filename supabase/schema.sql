-- Kos payment tracker — schema + RLS + seed
-- Run once in Supabase SQL Editor (production).
-- Local/CI: use supabase/migrations/ instead (kept in sync).

create extension if not exists "pgcrypto";

create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name)
);

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  rent numeric(12, 2) not null default 0 check (rent >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (building_id, name)
);

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  phone text,
  move_in_date date not null,
  rent numeric(12, 2) not null check (rent >= 0),
  is_active boolean not null default true,
  move_out_date date check (move_out_date is null or move_out_date >= move_in_date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  period_month date not null,
  paid_date date not null,
  amount numeric(12, 2) not null check (amount > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, period_month)
);

create index if not exists idx_rooms_building on rooms(building_id);
create index if not exists idx_tenants_room on tenants(room_id);
create index if not exists idx_tenants_active on tenants(is_active);
create unique index if not exists uniq_active_tenant_per_room on tenants(room_id) where is_active;
create index if not exists idx_payments_tenant on payments(tenant_id);
create index if not exists idx_payments_period on payments(period_month);

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_buildings_updated on buildings;
create trigger trg_buildings_updated before update on buildings
  for each row execute function touch_updated_at();
drop trigger if exists trg_rooms_updated on rooms;
create trigger trg_rooms_updated before update on rooms
  for each row execute function touch_updated_at();
drop trigger if exists trg_tenants_updated on tenants;
create trigger trg_tenants_updated before update on tenants
  for each row execute function touch_updated_at();
drop trigger if exists trg_payments_updated on payments;
create trigger trg_payments_updated before update on payments
  for each row execute function touch_updated_at();
alter table buildings enable row level security;
alter table rooms enable row level security;
alter table tenants enable row level security;
alter table payments enable row level security;

create policy "authenticated_all_buildings" on buildings
  for all to authenticated using (true) with check (true);

create policy "authenticated_all_rooms" on rooms
  for all to authenticated using (true) with check (true);

create policy "authenticated_all_tenants" on tenants
  for all to authenticated using (true) with check (true);

create policy "authenticated_all_payments" on payments
  for all to authenticated using (true) with check (true);

-- Seed: 2 buildings × 5 rooms (idempotent)
insert into buildings (name)
select v.name
from (values ('Gedung A'), ('Gedung B')) as v(name)
where not exists (select 1 from buildings b where b.name = v.name);

insert into rooms (building_id, name, rent)
select b.id, r.name, 1500000
from buildings b
cross join (values ('1'), ('2'), ('3'), ('4'), ('5')) as r(name)
where not exists (
  select 1 from rooms rm where rm.building_id = b.id and rm.name = r.name
);

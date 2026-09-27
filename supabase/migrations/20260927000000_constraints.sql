-- Constraints guarding business rules (idempotent; keep supabase/schema.sql in sync).
-- 1 active tenant per room, non-negative rent, positive payment, unique building names, updated_at.

-- updated_at columns
alter table buildings add column if not exists updated_at timestamptz not null default now();
alter table rooms add column if not exists updated_at timestamptz not null default now();
alter table tenants add column if not exists updated_at timestamptz not null default now();
alter table payments add column if not exists updated_at timestamptz not null default now();

-- auto-touch updated_at
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

-- unique building name
create unique index if not exists uniq_buildings_name on buildings(name);

-- non-empty names (app also validates with reqName)
do $$ begin
  alter table buildings add constraint chk_buildings_name_nonempty check (char_length(btrim(name)) > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table rooms add constraint chk_rooms_name_nonempty check (char_length(btrim(name)) > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tenants add constraint chk_tenants_name_nonempty check (char_length(btrim(name)) > 0);
exception when duplicate_object then null; end $$;

-- money guards
do $$ begin
  alter table rooms add constraint chk_rooms_rent_nonneg check (rent >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tenants add constraint chk_tenants_rent_nonneg check (rent >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table payments add constraint chk_payments_amount_pos check (amount > 0);
exception when duplicate_object then null; end $$;

-- one active tenant per room
create unique index if not exists uniq_active_tenant_per_room on tenants(room_id) where is_active;

-- move_out sane when present
do $$ begin
  alter table tenants add constraint chk_tenants_move_out_after_in
    check (move_out_date is null or move_out_date >= move_in_date);
exception when duplicate_object then null; end $$;

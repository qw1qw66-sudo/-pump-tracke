-- Pump Tracker Cloud Sync schema for Supabase
-- Run this in Supabase SQL Editor.

create table if not exists public.pump_tracker_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.pump_tracker_state enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pump_tracker_state_set_updated_at on public.pump_tracker_state;
create trigger pump_tracker_state_set_updated_at
before update on public.pump_tracker_state
for each row
execute function public.set_updated_at();

drop policy if exists "pump tracker select own state" on public.pump_tracker_state;
create policy "pump tracker select own state"
on public.pump_tracker_state
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "pump tracker insert own state" on public.pump_tracker_state;
create policy "pump tracker insert own state"
on public.pump_tracker_state
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "pump tracker update own state" on public.pump_tracker_state;
create policy "pump tracker update own state"
on public.pump_tracker_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

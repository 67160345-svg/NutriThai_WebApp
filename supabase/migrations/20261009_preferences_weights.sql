-- Run after 20261009_food_units_custom_logs.sql. Does not modify the food catalog.
begin;
create table if not exists public.food_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id bigint references public.foods(id) on delete cascade,
  custom_food_id uuid references public.custom_foods(id) on delete cascade,
  food_key text generated always as (case when food_id is not null then 'catalog:' || food_id::text else 'custom:' || custom_food_id::text end) stored,
  preference text not null check (preference in ('like','not_interested','avoid')),
  updated_at timestamptz not null default now(),
  primary key (user_id, food_key),
  check (num_nonnulls(food_id, custom_food_id) = 1)
);
create table if not exists public.weight_logs (
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(6,2) not null check (weight_kg between 20 and 500),
  updated_at timestamptz not null default now(),
  primary key (user_id, measured_on)
);
alter table public.food_preferences enable row level security;
alter table public.weight_logs enable row level security;
revoke all on public.food_preferences, public.weight_logs from anon, authenticated;
grant select, insert, update, delete on public.food_preferences, public.weight_logs to authenticated;
drop policy if exists "Own food preferences" on public.food_preferences;
create policy "Own food preferences" on public.food_preferences for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and (custom_food_id is null or exists (
    select 1 from public.custom_foods c where c.id = custom_food_id and c.user_id = (select auth.uid())
  )));
drop policy if exists "Own weight logs" on public.weight_logs;
create policy "Own weight logs" on public.weight_logs for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop trigger if exists food_preferences_updated_at on public.food_preferences;
create trigger food_preferences_updated_at before update on public.food_preferences
  for each row execute function public.set_updated_at();
drop trigger if exists weight_logs_updated_at on public.weight_logs;
create trigger weight_logs_updated_at before update on public.weight_logs
  for each row execute function public.set_updated_at();
notify pgrst, 'reload schema';
commit;

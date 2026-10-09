-- NutriThai steps 1–4. Apply AFTER 20261002_food_catalog_search_index.sql.
-- Additive and repeatable: no inferred serving weights and no nutrition rewrites.
begin;
alter table public.foods add column if not exists name_th text;
alter table public.foods add column if not exists serving_size numeric(12, 6) not null default 1 check (serving_size > 0 and serving_size <= 10000);
alter table public.foods add column if not exists serving_unit text not null default 'portion' check (serving_unit in ('portion', 'g', 'ml'));
alter table public.foods add column if not exists serving_label text not null default 'หน่วยเดิม (ไม่ระบุขนาด)' check (char_length(trim(serving_label)) between 1 and 100);
alter table public.foods add column if not exists portion_grams numeric(12, 6) check (portion_grams > 0 and portion_grams <= 10000);
alter table public.food_logs add column if not exists serving_size numeric(12, 6) not null default 1 check (serving_size > 0 and serving_size <= 10000);
alter table public.food_logs add column if not exists serving_unit text not null default 'portion' check (serving_unit in ('portion', 'g', 'ml'));
alter table public.food_logs add column if not exists serving_label text not null default 'หน่วยเดิม (ไม่ระบุขนาด)' check (char_length(trim(serving_label)) between 1 and 100);
alter table public.food_logs add column if not exists portion_grams numeric(12, 6) check (portion_grams > 0 and portion_grams <= 10000);

create table if not exists public.custom_foods (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    name text not null check (char_length(trim(name)) between 1 and 200),
    category text not null check (category in ('food', 'drink', 'dessert')),
    calories numeric(10, 3) not null default 0 check (calories >= 0 and calories <= 10000),
    protein numeric(10, 3) not null default 0 check (protein >= 0 and protein <= 1000),
    carbs numeric(10, 3) not null default 0 check (carbs >= 0 and carbs <= 1000),
    fat numeric(10, 3) not null default 0 check (fat >= 0 and fat <= 1000),
    sugar numeric(10, 3) not null default 0 check (sugar >= 0 and sugar <= 1000),
    fiber numeric(10, 3) not null default 0 check (fiber >= 0 and fiber <= 1000),
    serving_size numeric(12, 6) not null default 1 check (serving_size > 0 and serving_size <= 10000),
    serving_unit text not null default 'portion' check (serving_unit in ('portion', 'g', 'ml')),
    serving_label text not null default 'หน่วยเดิม (ไม่ระบุขนาด)' check (char_length(trim(serving_label)) between 1 and 100),
    portion_grams numeric(12, 6) check (portion_grams > 0 and portion_grams <= 10000),
    created_at timestamptz not null default now()
);
create index if not exists custom_foods_user_name_idx on public.custom_foods (user_id, name, id);
alter table public.custom_foods enable row level security;
revoke all on public.custom_foods from anon, authenticated;
grant select, insert on public.custom_foods to authenticated;
drop policy if exists "Read own custom foods" on public.custom_foods;
create policy "Read own custom foods" on public.custom_foods for select to authenticated
    using ((select auth.uid()) = user_id);
drop policy if exists "Create own custom foods" on public.custom_foods;
create policy "Create own custom foods" on public.custom_foods for insert to authenticated
    with check ((select auth.uid()) = user_id);
alter table public.food_logs add column if not exists custom_food_id uuid
    references public.custom_foods(id) on delete set null;
alter table public.food_logs add column if not exists category text not null default 'food'
    check (category in ('food', 'drink', 'dessert'));
alter table public.food_logs alter column servings type numeric(12, 6);
create index if not exists food_logs_custom_food_id_idx on public.food_logs(custom_food_id);
-- Nullable IDs allow old AI/custom snapshots; prevent linking someone else's food.
drop policy if exists "Own custom food references" on public.food_logs;
create policy "Own custom food references" on public.food_logs as restrictive for all to authenticated
    using (true)
    with check (
        (food_id is null or custom_food_id is null)
        and (custom_food_id is null or exists (
            select 1 from public.custom_foods c where c.id = custom_food_id and c.user_id = (select auth.uid())
        ))
    );
-- New Thai names participate in the same indexed search. Literal %/_ are escaped.
do $$
declare extension_schema name;
begin
    select n.nspname into extension_schema from pg_extension e
    join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
    if extension_schema is null then raise exception 'Apply search migration first (pg_trgm missing)'; end if;
    execute format('create index if not exists foods_name_th_trgm_idx on public.foods using gin (name_th %I.gin_trgm_ops)', extension_schema);
end;
$$;
create or replace function public.search_foods(search_query text, result_limit integer default 8, category_filter text default null)
returns setof public.foods language sql stable security invoker
set search_path = public, extensions
as $$
    with pattern as (
        select '%' || replace(replace(replace(btrim(search_query), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_') || '%' as value
    )
    select f.* from public.foods f cross join pattern p
    where btrim(search_query) <> ''
      and (f.name ilike p.value escape E'\\' or f.english_name ilike p.value escape E'\\' or f.name_th ilike p.value escape E'\\')
      and (category_filter is null or f.category=category_filter)
    order by f.name, f.id
    limit greatest(1, least(coalesce(result_limit,8),50));
$$;
grant execute on function public.search_foods(text,integer,text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;

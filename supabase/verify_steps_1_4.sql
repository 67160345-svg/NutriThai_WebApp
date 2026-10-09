-- Read-only checks. Run after both migrations in Supabase SQL Editor.
select table_name, column_name, data_type from information_schema.columns
where table_schema='public' and table_name in ('foods','food_logs','custom_foods')
order by table_name, ordinal_position;
select schemaname, tablename, indexname from pg_indexes
where schemaname='public' and tablename in ('foods','food_logs','custom_foods');
select schemaname, tablename, policyname, roles, cmd from pg_policies
where schemaname='public' and tablename in ('foods','food_logs','custom_foods');
select id,name,name_th,category from public.search_foods('ข้าว',8,'food');
select id,name,name_th,category from public.search_foods('Abalone',8,null);
select count(*) <= 8 as search_limit_ok from public.search_foods('a',8,null);
select count(*) = 0 as blank_search_ok from public.search_foods('  ',8,null);
explain (analyze, buffers) select * from public.foods
where name ilike '%Abalone%' or english_name ilike '%Abalone%' or name_th ilike '%Abalone%';
-- A sequential scan may be appropriate for small tables/broad terms; do not force an index.

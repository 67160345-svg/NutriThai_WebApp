-- Read-only: safe to run BEFORE migration, even when new tables are absent.
-- Select the project/branch matching root .env in the Supabase Dashboard.
-- This query cannot prove the result of a previous SQL Editor transaction;
-- also inspect the migration execution result for an error or successful COMMIT.
select current_database() as database_name, current_user as sql_role;

with required(table_name, column_name) as (values
  ('foods', 'name_th'), ('foods', 'serving_size'), ('foods', 'serving_unit'),
  ('foods', 'serving_label'), ('foods', 'portion_grams'),
  ('custom_foods', 'id'), ('custom_foods', 'user_id'),
  ('custom_foods', 'serving_size'), ('custom_foods', 'serving_unit'),
  ('custom_foods', 'serving_label'), ('custom_foods', 'portion_grams'),
  ('food_logs', 'custom_food_id'), ('food_logs', 'category'),
  ('food_logs', 'serving_size'), ('food_logs', 'serving_unit'),
  ('food_logs', 'serving_label'), ('food_logs', 'portion_grams')
)
select r.table_name, r.column_name, c.column_name is not null as present
from required r left join information_schema.columns c
  on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
order by r.table_name, r.column_name;

select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in ('foods','food_logs','custom_foods');

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname='public'
and tablename in ('foods','food_logs','custom_foods');

select table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name in ('foods','food_logs','custom_foods')
and grantee in ('anon','authenticated') order by table_name, grantee, privilege_type;

select tablename, indexname from pg_indexes where schemaname='public'
and tablename in ('foods','food_logs','custom_foods');

select e.extname, n.nspname as extension_schema from pg_extension e
join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';

select pg_get_functiondef(p.oid) as search_function
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='search_foods';

-- If SQL confirms the new tables/columns exist but REST still cannot see them,
-- investigate grants/cache before changing anything. The migration already
-- sends NOTIFY pgrst, 'reload schema' within its transaction.

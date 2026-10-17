-- Language priority is applied BEFORE pagination and search result limits.
begin;
alter table public.foods add column if not exists has_thai_name boolean
 generated always as (coalesce(name_th ~ '[ก-ฮ]',false)) stored;
create index if not exists foods_thai_first_idx
 on public.foods(has_thai_name desc,name_th,name,id);
create or replace function public.search_foods(search_query text, result_limit integer default 8, category_filter text default null)
returns setof public.foods language sql stable security invoker
set search_path = public, extensions
as $$
 with pattern as (
  select '%' || replace(replace(replace(btrim(search_query),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') || '%' as value
 )
 select f.* from public.foods f cross join pattern p
 where btrim(search_query) <> ''
  and (f.name ilike p.value escape E'\\' or f.english_name ilike p.value escape E'\\' or f.name_th ilike p.value escape E'\\')
  and (category_filter is null or f.category=category_filter)
 order by f.has_thai_name desc,f.name_th asc nulls last,f.name,f.id
 limit greatest(1,least(coalesce(result_limit,8),50));
$$;
grant execute on function public.search_foods(text,integer,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;

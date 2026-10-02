create schema if not exists extensions;

do $$
declare
    trigram_schema name;
begin
    if not exists (select 1 from pg_extension where extname = 'pg_trgm') then
        execute 'create extension pg_trgm with schema extensions';
    end if;

    select namespace.nspname
    into trigram_schema
    from pg_extension as extension
    join pg_namespace as namespace on namespace.oid = extension.extnamespace
    where extension.extname = 'pg_trgm';

    execute format(
        'create index if not exists foods_name_trgm_idx on public.foods using gin (name %I.gin_trgm_ops)',
        trigram_schema
    );
    execute format(
        'create index if not exists foods_english_name_trgm_idx on public.foods using gin (english_name %I.gin_trgm_ops)',
        trigram_schema
    );
end;
$$;

create or replace function public.search_foods(
    search_query text,
    result_limit integer default 8,
    category_filter text default null
)
returns setof public.foods
language sql
stable
security invoker
set search_path = public, extensions
as $$
    select food.*
    from public.foods as food
    where btrim(search_query) <> ''
      and (
          food.name ilike '%' || btrim(search_query) || '%'
          or food.english_name ilike '%' || btrim(search_query) || '%'
      )
      and (category_filter is null or food.category = category_filter)
    order by food.name
    limit greatest(1, least(coalesce(result_limit, 8), 50));
$$;

grant execute on function public.search_foods(text, integer, text) to anon, authenticated;

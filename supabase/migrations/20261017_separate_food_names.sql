-- Split only an explicit, balanced trailing portion such as (1 cup, 244 g).
-- Other parentheses, e.g. Milk (2%) or brand/recipe details, are retained.
begin;
alter table public.foods add column if not exists original_name text;
alter table public.foods add column if not exists source_portion text;
comment on column public.foods.original_name is 'Original catalog name before separating its trailing portion; retained for audit/reversal.';
comment on column public.foods.source_portion is 'Verbatim source portion description, e.g. 1 cup, 244 g; separate from the food name.';

create temporary table _food_name_audit on commit drop as
 select (select md5(coalesce(string_agg((to_jsonb(f)-array['name','english_name','original_name','source_portion'])::text,'' order by f.id),'')) from public.foods f) as nutrition_hash,
        (select md5(coalesce(string_agg(to_jsonb(l)::text,'' order by l.id),'')) from public.food_logs l) as history_hash;

create temporary table _food_name_parts (
 id bigint primary key, original_name text not null, clean_name text not null,
 source_portion text not null
) on commit drop;
do $$
declare r record; pos integer; depth integer; portion text; clean text; grams text;
begin
 for r in select id,name,original_name,source_portion,portion_grams from public.foods loop
  if right(r.name,1) <> ')' then continue; end if;
  depth := 0;
  for pos in reverse char_length(r.name)..1 loop
   if substr(r.name,pos,1)=')' then depth:=depth+1;
   elsif substr(r.name,pos,1)='(' then
    depth:=depth-1;
    if depth=0 then
     portion:=substr(r.name,pos+1,char_length(r.name)-pos-1);
     clean:=rtrim(substr(r.name,1,pos-1));
     grams:=substring(portion from ', ([0-9]+(?:\.[0-9]+)?) g$');
     if grams is not null and clean <> '' then
      if r.portion_grams is not null and r.portion_grams <> grams::numeric then
       raise exception 'Portion weight mismatch for food %',r.id;
      end if;
      if (r.original_name is not null and r.original_name <> r.name)
       or (r.source_portion is not null and r.source_portion <> portion) then
       raise exception 'Existing separated metadata conflicts for food %',r.id;
      end if;
      insert into _food_name_parts values(r.id,r.name,clean,portion);
     end if;
     exit;
    end if;
   end if;
  end loop;
 end loop;
end $$;
update public.foods f set
 original_name=p.original_name, source_portion=p.source_portion, name=p.clean_name,
 english_name=case when f.english_name=p.original_name then p.clean_name else f.english_name end
from _food_name_parts p where f.id=p.id;
do $$ begin
 if (select nutrition_hash from _food_name_audit) is distinct from
    (select md5(coalesce(string_agg((to_jsonb(f)-array['name','english_name','original_name','source_portion'])::text,'' order by f.id),'')) from public.foods f)
 or (select history_hash from _food_name_audit) is distinct from
    (select md5(coalesce(string_agg(to_jsonb(l)::text,'' order by l.id),'')) from public.food_logs l) then
  raise exception 'Nutrition, identity, serving metadata or food history changed unexpectedly';
 end if;
end $$;
-- Existing serving units, nutrient values, IDs, Thai translations and log snapshots stay intact.
notify pgrst, 'reload schema';
commit;

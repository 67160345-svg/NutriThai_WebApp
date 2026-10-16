import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const source = JSON.parse(read('supabase/data/catalog-metadata-reviewed.json'));
const migration = read('supabase/migrations/20261016_verified_catalog_metadata.sql');
const db = new PGlite({ extensions: { pg_trgm } });
await db.exec(`create role anon; create role authenticated;
 create schema auth; create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema public,auth to anon,authenticated;`);
await db.exec(read('supabase/schema.sql'));
const nutrients = ['calories','protein','carbs','fat','sugar','fiber'];
const fields = ['food_code','name','english_name','category',...nutrients];
for (let start = 0; start < source.length; start += 500) {
  await db.query(`insert into public.foods(${fields.join(',')})
   select ${fields.join(',')} from jsonb_to_recordset($1::jsonb) as r(
    food_code text,name text,english_name text,category text,
    calories numeric,protein numeric,carbs numeric,fat numeric,sugar numeric,fiber numeric)`,
   [JSON.stringify(source.slice(start,start+500))]);
}
const owner = '11111111-1111-1111-1111-111111111111';
await db.query('insert into auth.users values ($1)',[owner]);
await db.query(`insert into public.food_logs(user_id,food_id,food_name,meal_type,servings,
 calories_per_serving,meal_date) values($1,1,'legacy milk','breakfast',2,148.8,'2026-01-01')`,[owner]);
const beforeFoods = (await db.query(`select ${fields.join(',')} from public.foods order by id`)).rows;
const beforeLogs = (await db.query('select * from public.food_logs order by id')).rows;
await db.exec(migration);
await db.exec(migration); // Reapplying must not rescale nutrients or duplicate data.
assert.deepEqual((await db.query(`select ${fields.join(',')} from public.foods order by id`)).rows,beforeFoods);
assert.deepEqual((await db.query('select * from public.food_logs order by id')).rows,beforeLogs);
const summary = (await db.query(`select count(*)::int as total,
 count(portion_grams)::int as weights,count(name_th)::int as thai from public.foods`)).rows[0];
assert.equal(summary.total,4580);
assert.equal(summary.weights,4580);
assert.equal(summary.thai,source.filter(r=>r.name_th).length);
const milk = (await db.query("select * from public.foods where food_code='FNDDS-2021-2023-11111000'")).rows[0];
assert.equal(Number(milk.portion_grams),244);
assert.equal(Number(milk.serving_size),1);
assert.equal(milk.serving_unit,'portion');
assert.equal(Number(milk.calories)*122/Number(milk.portion_grams),74.4);
// A fractional source portion remains ONE reference portion, never half again.
const duck = (await db.query("select * from public.foods where name like 'Duck, cooked, skin eaten%'")).rows[0];
assert.equal(Number(duck.serving_size),1);
assert.equal(Number(duck.portion_grams),380);
const sticks = (await db.query("select * from public.foods where name like 'Potato sticks, plain%'")).rows[0];
assert.equal(Number(sticks.portion_grams),3); // Whole source portion of 10 sticks.
await db.exec('set role anon');
assert((await db.query("select * from public.search_foods('ข้าว',8,'food')")).rows.length > 0);
assert((await db.query("select * from public.search_foods('นม',8,'drink')")).rows.length > 0);
await db.exec('reset role');
// A manually reviewed Thai name survives repeat application.
await db.query("update public.foods set name_th='ชื่อที่ผู้ใช้ตรวจแล้ว' where id=1");
await db.exec(migration);
assert.equal((await db.query('select name_th from public.foods where id=1')).rows[0].name_th,'ชื่อที่ผู้ใช้ตรวจแล้ว');
// A changed nutrient must abort the whole migration before it changes any rows.
await db.exec('update public.foods set calories=calories+1 where id=1');
await assert.rejects(db.exec(migration),/Catalog differs from reviewed source/);
await db.exec('rollback');
await db.exec('update public.foods set calories=calories-1 where id=1');
await db.exec("update public.foods set serving_unit='g',serving_size=100 where id=2");
await assert.rejects(db.exec(migration),/Existing serving metadata needs review/);
await db.exec('rollback');
assert.deepEqual((await db.query('select * from public.food_logs order by id')).rows,beforeLogs);
await db.close();
console.log(`catalog: ${summary.total} explicit portions, ${summary.thai} Thai names, repeatability, source drift guards, gram conversion, Thai search and unchanged nutrition/history passed`);

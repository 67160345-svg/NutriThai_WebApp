import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root),'utf8');
const sql = read('supabase/schema.sql');
const migration = read('supabase/migrations/20261009_food_units_custom_logs.sql');
const oldMigration = read('supabase/migrations/20261002_food_catalog_search_index.sql');
const bootstrap = `create role anon; create role authenticated;
create schema auth; create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
grant usage on schema public,auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;`;
const a='11111111-1111-1111-1111-111111111111';
const b='22222222-2222-2222-2222-222222222222';
const food='33333333-3333-3333-3333-333333333333';
for (const mode of ['fresh', 'upgrade']) {
  const db = new PGlite({extensions:{pg_trgm}});
  await db.exec(bootstrap);
  if(mode === 'fresh') await db.exec(sql);
  else {
    await db.exec(sql.split('-- NutriThai steps 1–4.')[0]);
    await db.exec(`insert into auth.users values ('${a}'),('${b}');
      insert into public.foods(name,category,calories) values ('legacy','food',123);
      insert into public.food_logs(user_id,food_id,food_name,meal_type,servings,calories_per_serving,meal_date)
      values ('${a}',1,'legacy','lunch',1.5,123,'2026-01-01');`);
    await db.exec(oldMigration);
    await db.exec(migration);
    const old=(await db.query('select * from public.food_logs')).rows[0];
    assert.equal(Number(old.calories_per_serving),123);
    assert.equal(Number(old.servings),1.5);
    assert.equal(old.serving_label,'หน่วยเดิม (ไม่ระบุขนาด)');
  }
  await db.exec(migration); // Repeatability.
  await db.exec(`insert into auth.users values ('${a}'),('${b}') on conflict do nothing;
    insert into public.foods(name,english_name,name_th,category,calories) values
    ('Rice','Rice','ข้าวสวย','food',130), ('Rice milk','Rice milk','น้ำนมข้าว','drink',60),
    ('100% rice','100% rice','ข้าวร้อยเปอร์เซ็นต์','food',140);
    set role anon;`);
  let rows=(await db.query("select * from public.search_foods('ข้าว',8,'food')")).rows;
  assert.equal(rows.length,2);
  assert(rows.every(r=>r.category==='food'));
  assert.equal((await db.query("select * from public.search_foods('RiCe',1,null)")).rows.length,1);
  assert.equal((await db.query("select * from public.search_foods('  ',8,null)")).rows.length,0);
  assert.equal((await db.query("select * from public.search_foods('%',8,null)")).rows.length,1);
  assert.equal((await db.query("select * from public.search_foods('_',8,null)")).rows.length,0);
  await assert.rejects(db.query('select * from public.custom_foods'));
  await db.exec(`reset role; set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
  await db.exec(`insert into public.custom_foods(id,user_id,name,category,calories,serving_size,serving_unit)
    values ('${food}','${a}','My milk','drink',60,100,'ml');`);
  await assert.rejects(db.exec(`insert into public.custom_foods(user_id,name,category,calories) values ('${b}','forged','food',1)`));
  await db.exec(`insert into public.food_logs(user_id,custom_food_id,source,food_name,meal_type,servings,calories_per_serving,meal_date)
    values ('${a}','${food}','custom','My milk','lunch',2,60,'2026-01-02');`);
  await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
  assert.equal((await db.query('select * from public.custom_foods')).rows.length,0);
  assert.equal((await db.query('select * from public.food_logs')).rows.length,0);
  assert.equal((await db.query("update public.food_logs set meal_type='dinner' returning id")).rows.length,0);
  await assert.rejects(db.exec(`insert into public.food_logs(user_id,custom_food_id,source,food_name,meal_type,servings,calories_per_serving,meal_date)
    values ('${b}','${food}','custom','stolen','lunch',1,60,'2026-01-02');`));
  await db.exec('reset role');
  const indices=(await db.query("select indexname from pg_indexes where tablename='foods'")).rows.map(r=>r.indexname);
  for(const name of ['foods_name_trgm_idx','foods_english_name_trgm_idx','foods_name_th_trgm_idx']) assert(indices.includes(name));
  console.log(`${mode}: migration, repeated migration, literal Thai/English search, index existence, legacy snapshots, and two-user RLS passed`);
  await db.close();
}

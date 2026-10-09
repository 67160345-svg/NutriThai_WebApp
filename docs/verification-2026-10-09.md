# ผลตรวจในเครื่องและ Supabase — 9 ตุลาคม 2026

ตรวจจาก workspace ปัจจุบันและ `.env` ที่ root โดยไม่แสดง URL/key/token ไม่เขียนข้อมูลไป Supabase และไม่แก้ `.env`

## ผล Supabase ล่าสุด หลังผู้ใช้แจ้ง policy ซ้ำ

ผู้ใช้ขอข้ามการทดสอบ flow/สองบัญชีไว้ก่อน หลังยืนยันการเชื่อมต่อและโครงสร้างที่ตรวจแล้ว จึงหยุดงานทดสอบส่วนนี้ตามคำขอ ผลการใช้งานจริงและการอ่าน/แก้ข้ามบัญชียังคงเป็นรายการรอตรวจ ไม่ถือว่าผ่านโดยอัตโนมัติ

ตรวจ REST/RPC ซ้ำในรอบถัดมา: `foods.name_th` และคอลัมน์หน่วยทั้งสี่อ่านได้แล้ว; อังกฤษ, case-insensitive, limit/category, คำค้นว่าง/ไม่พบ และ literal `%`/`_` ผ่าน สคริปต์จบด้วย exit code 0 การค้น `ข้าว` ยังได้ 0 แถวจึงยังไม่ยืนยันการค้นไทยกับชื่อไทยจริง

`custom_foods` และ `food_logs` ตอบ permission denied (`42501`) สำหรับ anonymous จึงยังไม่ยืนยันคอลัมน์ส่วนตัวหรือ RLS สองบัญชี ไม่พบ error `42703`/`PGRST205` ในรอบล่าสุด แต่ permission denial ไม่ใช่หลักฐานว่าคอลัมน์ส่วนตัวครบ

ผู้ใช้แจ้ง SQL error `42710`: policy `Read own custom foods` มีอยู่แล้ว ไฟล์ migration ใน workspace มี `drop policy if exists` ก่อน `create policy` อยู่แล้ว จึงยังระบุสาเหตุไม่ได้โดยไม่มี SQL ที่รันจริง/ผล SQL Editor ไม่ควรลบ policy แยกหรือปิด RLS เพื่อแก้ error ให้รัน migration ฉบับปัจจุบันทั้งไฟล์ใน transaction แล้วตรวจ `supabase/verify_steps_1_4.sql`

ผู้ใช้ส่ง CSV ผล SQL Editor (`Supabase Snippet Untitled query.csv`) ซึ่งมีเฉพาะ `QUERY PLAN` ของคำสั่ง EXPLAIN สุดท้าย ยืนยันว่า query ค้น `Abalone` ใช้ Bitmap Index Scan บน `foods_name_trgm_idx`, `foods_english_name_trgm_idx` และ `foods_name_th_trgm_idx` ผ่าน BitmapOr/Bitmap Heap Scan พบ 1 แถว Execution Time 0.060 ms ในการรันครั้งนั้น ไม่ใช่ค่า latency ของ API หรือผล benchmark โดยรวม

CSV ถัดมา (`Supabase Snippet Untitled query (2).csv`) ยืนยันคอลัมน์และ data types ของทั้งสามตารางครบตามโค้ด: `foods` มี `name_th` และหน่วยทั้งสี่, `custom_foods` มีเจ้าของ/โภชนาการ/หน่วยครบ และ `food_logs` มี snapshot หน่วย, `custom_food_id` แบบ UUID และ category แล้ว หลักฐานนี้ยังไม่ตรวจ default/check constraints, foreign keys หรือ RLS

ผล RLS/policies ที่ผู้ใช้ส่งต่อมายืนยันว่า `foods`, `custom_foods` และ `food_logs` เปิด RLS ทั้งหมด `foods` อนุญาต SELECT ให้ anon/authenticated; `custom_foods` จำกัด SELECT และ INSERT ตาม `auth.uid() = user_id`; `food_logs` จำกัด SELECT/INSERT/UPDATE/DELETE ตามเจ้าของ โดย UPDATE ตรวจทั้ง USING และ WITH CHECK และมี restrictive policy ป้องกันอ้าง custom food ของผู้อื่น เงื่อนไขตรงกับ schema ที่คาดไว้ การตรวจ definitions ไม่ใช่ผลทดสอบด้วย session สองบัญชี

ยืนยันดัชนีค้นอาหารทั้งสาม คอลัมน์ทั้งสามตาราง และ RLS/policy definitions จาก SQL Editor ได้แล้ว ยังรอทดสอบ flow และการอ่าน/แก้ข้ามบัญชีจริง รวมตรวจ grants/default/check constraints/foreign keys หากต้องการตรวจรับโครงสร้างส่วนที่เหลือ ไม่มีการเขียนข้อมูล hosted Supabase ในการตรวจรอบนี้

## ผล Supabase รอบแรก (ก่อนผลล่าสุดด้านบน)

ตรวจผ่าน REST/RPC ด้วย publishable key ในรอบงานนี้ ไม่ใช่ผลจาก SQL Editor

| รายการ | ผล |
|---|---|
| อ่าน catalog | สำเร็จ |
| `foods.name_th` | HTTP 400 / `42703` |
| `foods.serving_size`, `serving_unit`, `serving_label`, `portion_grams` | ทุกคอลัมน์ HTTP 400 / `42703` |
| `custom_foods` พร้อมคอลัมน์หน่วย | HTTP 404 / `PGRST205` |
| `food_logs` พร้อม `custom_food_id`, category และคอลัมน์หน่วย | HTTP 400 / `42703`; ยังไม่แยกตรวจทุกคอลัมน์ |
| `Abalone` | 1 รายการ |
| `milk` และ `MILK`, limit 8 | 8 รายการและผลตรงกัน |
| `milk`, หมวด drink, limit 3 | 3 รายการและหมวดถูกต้อง |
| คำค้นว่างและคำค้นไม่พบ | รายการว่าง |
| `ข้าว`, หมวด food | 0 รายการ; ยังไม่ยืนยันการค้นไทยกับข้อมูลที่มีชื่อไทยจริง |
| คำค้น `%` และ `_` | ไม่ผ่านการค้นเป็นตัวอักษรจริง: มีผลที่ชื่อไม่มีอักขระนั้น |

API ยังไม่เห็น schema ที่ migration `20261009_food_units_custom_logs.sql` ต้องเพิ่ม จึงยังไม่ผ่านการตรวจรับข้อ 1–4 บนฐานจริง ผลนี้ไม่ระบุว่า migration ถูกเรียกหรือ rollback เพราะไม่มีผล SQL Editor/project/branch ให้ตรวจ ไม่สามารถตรวจดัชนี/policies ทั้งหมดด้วย publishable key

## ผลในเครื่อง

| รายการ | ผล |
|---|---|
| Frontend Vitest | 50 tests ผ่าน |
| Frontend coverage | statements 86.81%, branches 78.28%, functions 80.74%, lines 88.14% |
| Backend pytest | 53 tests ผ่าน: API/ฟีเจอร์เดิม 47 + verifier 6 |
| Backend `main.py` coverage | 92.29% |
| TypeScript `tsc --noEmit` | ผ่าน |
| Production build | ผ่าน |
| PGlite | fresh install, upgrade, migration ซ้ำ, literal search, indexes, snapshot เก่า และ RLS สองบัญชีผ่าน |

Vitest/Vite ต้องรันนอก sandbox เพราะถูกจำกัดการสร้าง subprocess การทดสอบ backend รอบสุดท้ายใช้ `python -m pytest tests -p no:cacheprovider --cov=main --cov-fail-under=80` เพื่อไม่เก็บ cache และไม่เดินเข้าโฟลเดอร์ cache ที่อ่านไม่ได้ มีคำเตือน deprecation ของ Starlette TestClient/httpx แต่ tests ผ่าน

## สิ่งที่ปรับในรอบนี้

- `backend/scripts/verify_supabase.py` รองรับ `--env-file .env` แบบไม่ประเมินคำสั่งในไฟล์; environment เดิมใน terminal มีลำดับเหนือกว่าไฟล์
- ตรวจแต่ละคอลัมน์ catalog, ตารางส่วนตัว/คอลัมน์ประวัติ, case-insensitive search, limit/category, คำค้นว่าง/ไม่พบ และ literal `%`/`_`; ตรวจต่อหลังจุดแรกผิดพลาด
- พิมพ์เฉพาะ HTTP status และรหัส error ที่ผ่าน allowlist ไม่พิมพ์ข้อความ server หรือ credentials; exit code 1 เมื่อพบข้อผิดพลาด
- `supabase/diagnose_steps_1_4.sql` ตรวจแบบอ่านอย่างเดียวก่อน migration ได้ แม้ยังไม่มีตารางใหม่
- เพิ่ม tests ป้องกัน secret รั่วใน output, ตรวจต่อหลัง HTTP error, โหลด environment และตรวจ wildcard regression

## สิ่งที่ยังต้องทำ

1. เลือก project/branch ใน Supabase Dashboard ให้ตรงกับ root `.env` แล้วตรวจผลการรัน migration ทั้งไฟล์ว่าจบ `COMMIT` หรือ error; ใช้ [SQL วินิจฉัย](../supabase/diagnose_steps_1_4.sql) หากต้องการตรวจ schema ก่อน
2. หลัง migration สำเร็จ รัน [SQL ตรวจรับ](../supabase/verify_steps_1_4.sql) และ `python backend/scripts/verify_supabase.py --env-file .env` จาก root
3. ผู้ใช้แจ้งว่ามีบัญชีทดสอบสองบัญชีและจะจัดช่องทางเข้าใช้ ยังไม่ได้รับช่องทางและยังไม่ได้ทดสอบข้อมูลส่วนตัวกับ hosted Supabase
4. ตรวจสร้างอาหาร → refresh → ใช้ซ้ำ → บันทึก → เปลี่ยนปริมาณ/วันที่/มื้อ/อาหาร → ตรวจยอด และยืนยันบัญชีที่สองอ่านหรือแก้ข้อมูลบัญชีแรกไม่ได้ ทำความสะอาดเฉพาะข้อมูลที่สร้างทดสอบ
5. ตรวจภาพ UI desktop/mobile: Vite เปิดได้ที่ `http://localhost:8443` แต่เครื่องมือ browser ไม่มี browser ที่เชื่อมต่อ (`browsers: []`); ยังไม่ได้ตรวจ screenshot ไม่มีการเปิด Backend รุ่นใหม่เพราะ schema ยังไม่พร้อม และหยุด Vite ที่เปิดตรวจแล้ว

ยังไม่เริ่ม roadmap ข้อ 5–10 และไม่สรุปว่าพร้อม production

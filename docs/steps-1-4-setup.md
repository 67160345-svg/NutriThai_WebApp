# NutriThai — การติดตั้งงานข้อ 1–4

อัปเดต 9 ตุลาคม 2026 จากโค้ด NutriThai_WebApp-main.zip ที่แนบมา โดยรวม README และเอกสารสถานะฉบับล่าสุดที่ผู้ใช้ส่งให้

## สถานะส่งมอบ

- ข้อ 1: โค้ดค้นหา, migration, SQL ตรวจสอบ และสคริปต์ตรวจ RPC พร้อมแล้ว; ทดสอบฐานข้อมูลจำลองแล้ว **ยังไม่ได้ apply หรือทดสอบบน Supabase ของผู้ใช้**
- ข้อ 2: เพิ่มหน่วยอ้างอิงและการแปลงปริมาณ พร้อมเก็บ snapshot หน่วยในประวัติ
- ข้อ 3: เพิ่มอาหารส่วนตัวและนำกลับมาใช้ซ้ำ เก็บตามบัญชีพร้อม RLS; Guest เก็บชั่วคราวใน memory
- ข้อ 4: แก้อาหาร ชื่อ/โภชนาการเฉพาะบันทึก มื้อ วันที่ และปริมาณได้ Dashboard/History ใช้ข้อมูลที่บันทึกสำเร็จจาก API

## 1. ติดตั้งฐานข้อมูลก่อนเปลี่ยนแอป

สำหรับ Supabase project เดิม เปิด SQL Editor และรันตามลำดับ:

1. `supabase/migrations/20261002_food_catalog_search_index.sql`
2. `supabase/migrations/20261009_food_units_custom_logs.sql`
3. `supabase/verify_steps_1_4.sql` (อ่านข้อมูลเพื่อตรวจคอลัมน์ ดัชนี สิทธิ์ และค้นหา)

ถ้าเคยทำข้อแรกแล้ว สามารถรันซ้ำได้ migration ใหม่ใช้ transaction และไม่ลบข้อมูลอาหาร/ประวัติเดิม
สำหรับ project ใหม่ รัน `supabase/schema.sql` เพียงไฟล์เดียว ซึ่งรวม schema รุ่นล่าสุด แล้วนำเข้าข้อมูลอาหาร
ไม่ต้องรัน SQL สำหรับสร้าง role/auth จากชุดทดสอบบน Supabase จริง

**อย่าเริ่ม Backend รุ่นนี้ก่อน migration ใหม่สำเร็จ** เพราะแอปอ่านตาราง `custom_foods` และคอลัมน์หน่วยใหม่ขณะโหลดบัญชี
สภาพแวดล้อมที่พัฒนาไม่มี Supabase URL/key หรือ direct database credentials ที่ใช้งานได้ และไฟล์ตั้งค่าที่แนบอยู่ใน archive เข้ารหัส จึงไม่สามารถยืนยันฐานจริงได้

## 2. ตั้งค่าและเริ่มแอป

สร้าง `.env` ที่ root ตาม `.env.example` ใส่ค่าของ project ของคุณเอง แล้วใช้ `start_local.bat` บน Windows ตามขั้นตอนเดิม
ติดตั้ง dependencies ก่อน:

```powershell
cd backend
python -m pip install -r requirements-dev.txt
cd ../frontend
npm ci
cd ..
./start_local.bat
```

หรือใช้ `docker compose up --build` หลังตั้งค่า environment สำหรับ Docker ตาม README
ขั้นตอนนี้ไม่ได้ deploy บน cloud และไม่ได้เปลี่ยน Supabase ของคุณให้อัตโนมัติ

## 3. ตรวจการค้นหากับ project จริง

ใน terminal ที่ตั้ง `SUPABASE_URL` และ `SUPABASE_PUBLISHABLE_KEY` แล้ว:

```powershell
python backend/scripts/verify_supabase.py
```

สคริปต์อ่านอย่างเดียว ตรวจคอลัมน์และ RPC ด้วยคำค้นไทย/อังกฤษ หมวด และ limit โดยไม่แสดง key
ผลลัพธ์ 0 แถวอาจหมายถึง catalog ไม่มีชื่อนั้น ให้เลือกคำค้นที่มีอยู่จริงเพื่อทดสอบเพิ่มเติม
สคริปต์นี้ไม่โหลด `.env` เอง ให้ export environment ของ terminal ก่อน
ตรวจ query plan ด้วย `supabase/verify_steps_1_4.sql`; ตารางเล็กหรือคำค้นกว้างอาจใช้ sequential scan ได้ตามปกติ

## หน่วยและการแปลงปริมาณ

โภชนาการทุกช่องของอาหารอ้างอิง `serving_size` + `serving_unit` เดียวกัน:

| ฟิลด์ | ความหมาย | ตัวอย่าง |
|---|---|---|
| `serving_size` | จำนวนอ้างอิงของโภชนาการ | 100 |
| `serving_unit` | `g`, `ml` หรือ `portion` | g |
| `serving_label` | ชื่อหน่วยที่แสดง | กรัม / จาน / แก้ว |
| `portion_grams` | น้ำหนักต่อ **1 portion** เมื่อมีข้อมูลจริง | 250 |

- อาหาร 130 kcal ต่อ 100 g, กิน 150 g: multiplier = 150/100 = 1.5 และรวม 195 kcal
- อาหาร 500 kcal ต่อ 1 จาน, มีข้อมูล 250 g ต่อจาน, กิน 125 g: multiplier = 125/250 = 0.5 และรวม 250 kcal
- อาหารอ้างอิง 2 จาน จานละ 250 g: ใช้ 500 g เป็นน้ำหนักของโภชนาการชุดนั้น
- ไม่มีการแปลงกรัมเป็นมิลลิลิตร เพราะยังไม่มีข้อมูลความหนาแน่น
- ประวัติเก็บ multiplier ใน `servings` พร้อม snapshot หน่วย/ค่าอาหาร; แสดงปริมาณกลับด้วยหน่วยอ้างอิง
- รายการเก่ามีค่าเริ่มต้น 1 “หน่วยเดิม (ไม่ระบุขนาด)” **ไม่เดาว่าเป็น 100 g หรือหนึ่งจาน** ค่าเดิมและประวัติไม่ถูกคำนวณใหม่
- ก่อนใช้การแปลงกรัมกับ catalog เดิม ต้องตรวจแหล่งข้อมูลและกรอก metadata หน่วยใน Supabase ให้ถูกต้องด้วย ระบบไม่ได้ backfill น้ำหนักให้ 4,580 รายการโดยอัตโนมัติ
- เมนูทดแทนใน Insights จะเทียบเฉพาะปริมาณอ้างอิงเดียวกัน; ไม่เปรียบเทียบคนละหน่วยหรือ portion ที่ไม่ทราบน้ำหนัก

## วิธีใช้ฟีเจอร์ใหม่

### อาหารส่วนตัว

หน้า “เพิ่มอาหาร” → “อาหารของฉัน” → กรอกชื่อ/หมวด/จำนวนอ้างอิง/หน่วย/โภชนาการ → “บันทึกอาหารส่วนตัว”
อาหารจะปรากฏในรายการส่วนตัวและถูกเลือกเพื่อบันทึกลงมื้อ ปรับวันที่ มื้อ และปริมาณ แล้วกด “บันทึกอาหาร”
ครั้งถัดไปเลือกอาหารจากรายการส่วนตัวได้โดยไม่ต้องกรอกใหม่ Guest ใช้ได้แต่ข้อมูลหายเมื่อ refresh
การสร้างอาหารส่วนตัวและการบันทึกมื้อเป็นคนละขั้นตอน เพื่อให้สร้างรายการไว้ใช้ภายหลังได้

### แก้ประวัติ

หน้า “ประวัติอาหาร” → เลือกวันที่ → ปุ่มแก้ไขข้างรายการ
แก้วันที่ มื้อ และปริมาณ แล้วกด “บันทึกการแก้ไข”
หากเปลี่ยนอาหาร เปิด “เปลี่ยนอาหาร / แก้ชื่อและค่าโภชนาการ” แล้วค้นหา catalog หรือเลือกอาหารส่วนตัว
หากต้องการแก้ชื่อ/ค่าโภชนาการเฉพาะบันทึก ให้กด “กรอกหรือแก้ข้อมูลเฉพาะรายการนี้” → “ใช้ข้อมูลนี้กับรายการ” → “บันทึกการแก้ไข”
การแก้เฉพาะวันที่/มื้อ/ปริมาณรักษาโภชนาการ snapshot เดิม การเปลี่ยนอาหารจะสร้าง snapshot จากรายการที่เลือก
การกรอกแก้เองเฉพาะบันทึกจะใช้ `source=custom` โดยไม่แก้ catalog หรืออาหารส่วนตัวต้นฉบับ

## API ที่เปลี่ยน

- `GET /api/v1/foods`: ส่งหน่วยและ `name_th`; คำค้นใช้ RPC, หมวดใช้ทั้งค้นหาและ browse; เมื่อไม่ส่งคำค้น/limit ยังคงโหลด catalog ทั้งหมดตาม flow เดิม
- `GET /api/v1/custom-foods`: อ่านอาหารส่วนตัวของบัญชีปัจจุบัน
- `POST /api/v1/custom-foods`: สร้างอาหารส่วนตัว โดย Backend เป็นผู้กำหนดเจ้าของ
- `POST /api/v1/food-logs`: รองรับ custom_food_id, source, หน่วย, quantity และ quantity_unit; Backend คำนวณ multiplier และอ่านโภชนาการต้นฉบับของ catalog/custom reference
- `PUT /api/v1/food-logs/{id}`: แก้รายการครบ; ส่ง `replace_food=true` เมื่อต้องการเปลี่ยน snapshot อาหาร
- PATCH จำนวน serving แบบเดิมยังใช้ได้

## การทดสอบ

ผลตรวจรอบส่งมอบ: Frontend 50 tests, Backend 47 tests ผ่าน; TypeScript และ production build ผ่าน
Frontend coverage: statements 86.81%, branches 78.28%, functions 80.74%, lines 88.14%; Backend coverage 92.46%
SQL tests ผ่านทั้ง fresh install และ upgrade รวมรันซ้ำ ตรวจ index และ RLS สองบัญชี


```powershell
cd frontend
npm ci
./node_modules/.bin/tsc --noEmit
npm run test:coverage
npm run build
cd ../backend
python -m pytest --cov=main --cov-fail-under=80
cd ../database-tests
npm ci
npm test
```

ฐานทดสอบใช้ PGlite (PostgreSQL แบบ embedded) พร้อม pg_trgm และ auth fixture สองบัญชี ทดสอบ schema ใหม่ การอัปเกรด การรัน migration ซ้ำ คำค้นไทย/อังกฤษ/อักขระพิเศษ ดัชนี และ RLS
ไม่ใช่ผลทดสอบ integration กับ Supabase hosted หรือ Gemini จริง
การตรวจ UI เป็น automated component/integration tests ใน jsdom; ยังไม่ได้ตรวจภาพหน้าจอด้วย browser เนื่องจากดาวน์โหลด browser runtime ไม่สำเร็จ
ก่อนเปิดใช้งานจริง ให้ลองสองบัญชี สมัคร/เข้าสู่ระบบ เพิ่มอาหารส่วนตัว refresh ใช้ซ้ำ เปลี่ยนมื้อ/วันที่ และยืนยันว่าอีกบัญชีมองไม่เห็นข้อมูล

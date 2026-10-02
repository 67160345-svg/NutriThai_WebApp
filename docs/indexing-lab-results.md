# Database Indexing Lab — ผลทดลอง Lab 1

## วัตถุประสงค์

เปรียบเทียบ query plan และเวลาในการค้นหาบน PostgreSQL สองฐานที่มีข้อมูล `transactions` เหมือนกัน 1,000,000 rows:

- `pg_with_index`: มี `idx_tx_date` และ `idx_tx_customer`
- `pg_no_index`: ไม่มี secondary index; มีเฉพาะ primary-key index บน `id`

ใช้ชุดโจทย์ Lab 1 จากไฟล์ `indexing-lab_02.zip` ที่ได้รับ โดยไม่ได้เชื่อมต่อหรือแก้ไขฐานข้อมูล NutriThai/Supabase

## สภาพแวดล้อมทดลอง

- PostgreSQL 16.15 ใน Docker Desktop บน Windows
- ใช้ Docker Compose project แยกชื่อ `nutrithai-indexing-lab`
- เพื่อไม่ชนกับ PostgreSQL ในเครื่อง กำหนดพอร์ตฐานข้อมูลเป็น `15432` (มี index) และ `15433` (ไม่มี secondary index)
- ข้อมูลถูกสร้างด้วย `generate_series(1, 1000000)` และ seed เดียวกันทั้งคู่
- ตรวจยืนยันทั้งสองฐานมี 1,000,000 rows, `sum(id)=500000500000`, `sum(customer_id)=5004149140` และช่วงวันที่เท่ากัน

## วิธีทดลอง

1. รัน `labs/01-explain.sql` บนทั้งสองฐาน ซึ่งใช้ `EXPLAIN ANALYZE` กับ query 5 แบบเหมือนกัน
2. ตรวจ query plan, จำนวน rows และ execution time
3. รันแต่ละ query ซ้ำ 5 รอบ โดยสลับลำดับฐานข้อมูลในแต่ละรอบ และใช้ `EXPLAIN (ANALYZE, TIMING OFF, SUMMARY ON)` เพื่อลด overhead จากการวัดเวลาของแต่ละ node
4. เปรียบเทียบค่ามัธยฐาน (median) ของ execution time พร้อม min–max

## ผลการทดลอง

| Query | Plan เมื่อมี index | Median ไม่มี secondary index | Median มี index | ความแตกต่าง |
|---|---|---:|---:|---:|
| Exact date (`transaction_date = ...`) | `Bitmap Index Scan` + `Bitmap Heap Scan` | 16.591 ms (15.871–29.580) | 2.311 ms (2.220–6.192) | มี index เร็วขึ้นประมาณ **7.2 เท่า** |
| Customer (`customer_id = 42`) | `Bitmap Index Scan` + `Bitmap Heap Scan` | 16.144 ms (15.888–16.304) | 0.201 ms (0.191–0.314) | มี index เร็วขึ้นประมาณ **80 เท่า** |
| Narrow date range (7 วัน) | `Bitmap Index Scan` + `Bitmap Heap Scan` | 16.720 ms (16.406–18.480) | 10.097 ms (9.294–19.573) | มี index เร็วขึ้นประมาณ **1.7 เท่า** |
| Wide date range (6 เดือน, ประมาณครึ่งตาราง) | Planner ใช้ `Seq Scan` เมื่อไม่มี index; เลือก bitmap plan เมื่อมี | 48.707 ms (47.937–49.970) | 41.840 ms (39.752–56.656) | มี index เร็วขึ้นประมาณ **1.2 เท่า** ในการทดลองนี้ |
| `COUNT(*)` ตามวันที่ หลัง `VACUUM` | `Parallel Seq Scan` | 16.050 ms (15.548–17.138) | 0.158 ms (0.154–0.161) | มี index เร็วขึ้นประมาณ **102 เท่า** ด้วย `Index Only Scan` |

เวลาคือ median ของ execution time จากการรันซ้ำ ไม่รวม planning time ตัวเลข min–max แสดงความแปรผันระหว่างรอบ

### หลักฐานจาก query plan

- ไม่มี index: query ตามวันที่และลูกค้าใช้ `Parallel Seq Scan` และอ่าน/คัดกรองข้อมูลส่วนใหญ่ของตาราง
- มี index: query ตามลูกค้าใช้ `idx_tx_customer`; query ตามวันที่ใช้ `idx_tx_date`
- หลัง `VACUUM`, query `COUNT(*)` ใช้ `Index Only Scan` และพบ `Heap Fetches: 0`
- สำหรับช่วงวันที่กว้างที่คืนข้อมูลประมาณ 50% ของตาราง PostgreSQL เลือก plan ตามต้นทุนโดยประมาณ; การมี index ไม่ได้แปลว่าจะเร็วขึ้นเสมอ

## พื้นที่จัดเก็บ

| ฐาน | ขนาด table | ขนาด index รวม |
|---|---:|---:|
| ไม่มี secondary index | 71,647,232 bytes | 22,487,040 bytes |
| มี secondary indexes | 71,647,232 bytes | 36,732,928 bytes |

secondary indexes เพิ่มพื้นที่ประมาณ **14,245,888 bytes (13.58 MiB)** หรือเพิ่มจาก index footprint เดิมราว **63%** ในชุดข้อมูลนี้

## วิเคราะห์และข้อสรุป

1. Index ช่วยชัดเจนกับ exact match/selective lookups และ `COUNT(*)` ที่สามารถอ่านจาก index ได้โดยตรง
2. Composite/secondary index ควรสัมพันธ์กับเงื่อนไข filter และ order ที่แอปใช้ ไม่ควรสร้าง index ทุก column โดยไม่ตรวจ query workload
3. Query ที่คืนข้อมูลสัดส่วนสูงอาจยังต้องอ่านข้อมูลจำนวนมาก; PostgreSQL อาจเลือก sequential scan และประโยชน์ของ index ลดลง
4. Index ใช้พื้นที่เพิ่มและมีต้นทุนในการ `INSERT`, `UPDATE`, `DELETE` เพราะต้องดูแล index เพิ่มเติม งาน Lab 1 นี้ยังไม่ได้วัด write cost (มีแบบทดลองแยกใน Lab 3)
5. ผล benchmark ขึ้นกับ cache, disk, CPU, Docker resource limits, PostgreSQL version และสภาพเครื่อง จึงควรใช้เป็นผลจากเครื่องทดลองนี้ ไม่ใช่ตัวเลขรับประกันใน production

## การรันซ้ำ

ทำงานในโฟลเดอร์ lab ที่แยกจาก repository และฐานข้อมูล NutriThai:

```powershell
Set-Location E:\Users\indexing-lab\indexing-lab
docker compose -p nutrithai-indexing-lab up -d
docker exec pg_with_index psql -X -U student -d appdb -f /labs/01-explain.sql
docker exec pg_no_index psql -X -U student -d appdb -f /labs/01-explain.sql
```

Adminer สำหรับดูฐานข้อมูลอยู่ที่ `http://localhost:18080`; ใช้ server `pg_with_index` หรือ `pg_no_index` จากภายใน Docker network และฐานข้อมูล `appdb`

หยุด lab โดยเก็บข้อมูลไว้:

```powershell
docker compose -p nutrithai-indexing-lab down
```

## ข้อจำกัดของผล

ค่ามัธยฐานมาจากการรัน 5 รอบแบบสลับลำดับฐาน และใช้ cache ตามพฤติกรรมปกติของระบบ ไม่มีการล้าง OS/PostgreSQL cache ระหว่างรอบ ในการรัน Lab 1 รอบแรก query ช่วง 7 วันบนฐานมี index ใช้เวลา `46.811 ms` เทียบกับ `20.153 ms` บนฐานไม่มี index ซึ่งต่างจาก median หลังรันซ้ำ แสดงให้เห็นผลของ cache และความแปรผันในการทดลอง จึงรายงานทั้งการรันซ้ำและช่วง min–max แทนการสรุปจากรอบเดียว

## การประยุกต์ indexing กับ NutriThai

เพิ่มการค้นหา catalog ผ่าน backend ไปยัง Supabase RPC `search_foods` พร้อม GIN trigram indexes บน `foods.name` และ `foods.english_name`:

- Migration: `supabase/migrations/20261002_food_catalog_search_index.sql`
- Schema สำหรับ project ใหม่: `supabase/schema.sql`
- Backend รับ `search`, `category` และ `limit` ที่ `/api/v1/foods`; เมื่อมีคำค้นจะเรียก RPC แทนการดาวน์โหลดทั้ง catalog เพื่อกรองบน client
- Frontend หน่วงคำค้น 250 ms และขอผลลัพธ์ไม่เกิน 8 รายการ; การโหลด catalog ทั้งหมดที่ใช้กับหน้าอื่นยังคงทำงานเหมือนเดิม

**สถานะ migration:** โค้ดและ migration file ถูกเตรียมไว้ แต่ยังไม่ได้ apply กับ Supabase project จริงในขั้นตอนนี้ เนื่องจาก environment มี publishable key สำหรับ API แต่ไม่มี direct database connection/migration credentials. ให้รัน migration ผ่าน Supabase Dashboard → SQL Editor ก่อนเปิดใช้ server-side search รุ่นนี้บน project; จนกว่าจะ apply migration เส้นทางค้นหา RPC จะยังไม่พร้อม

### Benchmark ด้วย food catalog ของ NutriThai

คัดลอกเฉพาะ food catalog 4,580 rows ที่ API ของ Supabase ส่งกลับมาไปยัง database ทดสอบ PostgreSQL แยก แล้วรันคำค้น `Abalone` จำนวน 5 รอบก่อนและหลังสร้าง trigram indexes:

| สถานะ | Query plan | Median execution time | Min–max |
|---|---|---:|---:|
| ก่อน index | `Seq Scan` | 5.500 ms | 5.390–5.846 ms |
| หลัง index | `Bitmap Index Scan` บนทั้งสองชื่อ → `Bitmap Heap Scan` | 0.115 ms | 0.108–0.124 ms |

ใน local benchmark นี้ query เร็วขึ้นประมาณ **47.8 เท่า** และ `EXPLAIN ANALYZE` ยืนยันการใช้ GIN trigram indexes. ตัวเลขนี้วัดบน PostgreSQL ใน Docker บนเครื่องพัฒนา กับสำเนา catalog ไม่ใช่ latency ของ Supabase production; ผลจริงย่อมขึ้นกับ network, hardware, cache และจำนวนแถว

### เพิ่มชื่อไทยภายหลัง

การเพิ่มคอลัมน์ภายหลังทำได้แบบ additive migration จึงไม่ต้องลบหรือย้ายข้อมูลเดิม:

1. เพิ่ม `name_th text` แบบ nullable ก่อน เพื่อให้แถวเดิมยังใช้งานได้
2. Backfill คำแปลภาษาไทยตามแหล่งข้อมูลที่ตรวจสอบแล้ว; ค่าเดิมที่ยังไม่มีคำแปลปล่อยเป็น `NULL`
3. ปรับ `search_foods` ให้ค้น `name_th` เพิ่ม และสร้าง trigram index บนคอลัมน์นั้น
4. ปรับ API catalog ให้ส่ง `name_th`; frontend มี fallback ไป `name` ไว้แล้วสำหรับ record เก่า/record ที่ยังไม่แปล
5. ทดสอบการค้นหาไทย/อังกฤษและเปรียบเทียบ `EXPLAIN ANALYZE` หลัง migration

ไม่มีข้อมูลสูญหายจากการเพิ่ม nullable column แต่ช่วง deploy ควรรักษา fallback และปล่อยให้ application version เก่าอ่าน schema เดิมได้จนกว่า migration และ API rollout จะเสร็จ

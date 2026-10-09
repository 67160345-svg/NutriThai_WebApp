# อัปเดตสถานะงานข้อ 1–4 — 9 ตุลาคม 2026

งานเพิ่มเติมล่าสุดที่ผู้ใช้อนุมัติ: ทำข้อ 2–5 แล้ว ได้แก่ ความชอบอาหาร คัดลอก/บันทึกชุดมื้อ ชุดอาหารแนะนำ และ Insights พร้อมประวัติน้ำหนัก ดู [คู่มือและสถานะล่าสุด](features-2-5.md) Frontend 73 tests / Backend 62 tests และ production build ผ่าน ต้องรัน migration เพิ่มสำหรับความชอบและน้ำหนักบน Supabase ส่วนข้อ 1 ปรับข้อมูลอาหารยังเลื่อนไว้

แนวทางภาพสำหรับ frontend ในอนาคต: [Soft Green Dashboard](design/README.md) ผู้ใช้ให้เก็บเป็นคอนเซปต์ ยังไม่ได้อนุมัติให้ปรับ UI ตามภาพ

ผู้ใช้ขอข้ามการทดสอบ flow/สองบัญชีไว้ก่อน การเชื่อมต่อ Supabase และคอลัมน์/ดัชนี/RLS/policies ที่ตรวจแล้วได้รับการยืนยัน ส่วนการใช้งานจริงและการอ่าน/แก้ข้ามบัญชียังรอตรวจ ไม่ได้เริ่ม roadmap ข้อ 5–10

| งาน | โค้ด/การทดสอบในเครื่อง | Supabase ของผู้ใช้ |
|---|---|---|
| ค้นหาไทย/อังกฤษ หมวด limit และ migration | พร้อม; ผ่าน SQL tests ทั้ง fresh/upgrade/repeat และ RLS | API catalog/RPC รวม `%`/`_` ผ่าน; SQL ยืนยันดัชนีและ policies แล้ว; ค้นไทย 0 แถว |
| หน่วยอ้างอิงและแปลงปริมาณ | พร้อม; เก็บ snapshot ประวัติและไม่เดาหน่วยเก่า | คอลัมน์หน่วย catalog อ่านได้แล้ว; ยังรอทดสอบ flow จริง |
| อาหารส่วนตัว | พร้อม; API + UI + RLS และใช้ซ้ำ | SQL ยืนยันคอลัมน์, RLS และ policies แล้ว; รอทดสอบสองบัญชี |
| แก้รายการครบทุกช่อง | พร้อม; API + UI และเก็บโภชนาการเดิมเมื่อไม่ได้เปลี่ยนอาหาร | ต้องตรวจรับกับบัญชีจริง |

ลำดับงานต่อ: apply SQL 20261002 → 20261009 → verify_steps_1_4.sql → เปิดแอปรุ่นใหม่ → ตรวจ flow จริง → จึงเริ่มงานรายการโปรด/คัดลอกมื้อ
ดูคำสั่งและผลทดสอบใน [คู่มือติดตั้ง](steps-1-4-setup.md)
ผลล่าสุดในเครื่อง: Frontend 50 tests และ Backend 53 tests ผ่าน, TypeScript/build/PGlite ผ่าน ดู [รายงานตรวจ 9 ตุลาคม 2026](verification-2026-10-09.md) สำหรับหลักฐานจาก hosted Supabase และข้อที่ยังรอ ยังไม่ได้เปิด Backend รุ่นใหม่ในรอบตรวจ และไม่มี browser เชื่อมต่อสำหรับตรวจภาพ UI; หลักฐานคอลัมน์/ดัชนี/RLS พร้อมสำหรับเริ่มทดสอบ flow สองบัญชีแล้ว
ตัวเลข 88% ด้านล่างเป็นการประเมินเดิม ไม่ได้คำนวณใหม่จากจำนวนฟีเจอร์รอบนี้

---

## บันทึกสถานะก่อนการแก้ไขรอบนี้

# สถานะโปรเจกต์และแผนดำเนินงานต่อ

เอกสารนี้สรุปสิ่งที่ทำแล้ว งานที่ยังต้องทำ และแนวทางที่เตรียมไว้สำหรับ NutriThai โดยอ้างอิงสถานะและผลทดลองในเอกสารของโปรเจกต์ฉบับปัจจุบัน ตัวเลขความคืบหน้าเป็นการประเมินตนเอง ไม่ใช่ผลตรวจรับหรือการรับรอง production

## ทำอะไรไปแล้ว

### ตัวแอป NutriThai

- พัฒนา frontend ด้วย React, TypeScript, Vite และ Tailwind CSS พร้อม flow หลักสำหรับสมัคร/เข้าสู่ระบบ ใช้งานแบบ Guest ตั้งค่า Health Profile บันทึกอาหาร ดู Dashboard และดูประวัติ/Insights
- พัฒนา backend แบบ FastAPI modular monolith สำหรับ authentication, profile, food catalog, food logs และการวิเคราะห์รูปอาหาร
- เชื่อม Supabase Auth และ PostgreSQL โดยให้ backend ตรวจสอบ session และใช้ Row Level Security (RLS) จำกัดข้อมูลตามผู้ใช้
- เตรียมการวิเคราะห์รูปด้วย Gemini ผ่าน backend พร้อมให้ผู้ใช้ยินยอมก่อนส่งรูป
- เตรียม Docker Compose สำหรับรัน frontend และ backend ในเครื่อง และมีชุดทดสอบ frontend/backend
- เอกสาร architecture ประเมินความคืบหน้าโดยรวมไว้ที่ 88% โดยงาน cloud deployment และ production verification ยังไม่เสร็จ

### งานทดลองและปรับปรุงการค้นหาอาหาร

- ทดลอง PostgreSQL ด้วยข้อมูล transactions 1,000,000 แถว เปรียบเทียบฐานที่มีและไม่มี secondary indexes โดยรัน query ซ้ำ 5 รอบ
- ทดลองกับสำเนา food catalog ของ NutriThai จำนวน 4,580 รายการ พบว่า query `Abalone` ใช้เวลา median 5.500 ms ก่อนทำ index และ 0.115 ms หลังทำ GIN trigram indexes ในเครื่องทดลอง
- เตรียม backend ให้รับคำค้นและเรียก Supabase RPC `search_foods` แทนการดึง catalog ทั้งหมดมา filter บน client เมื่อมีคำค้น
- เตรียม frontend ให้หน่วงคำค้น 250 ms และจำกัดผลลัพธ์ที่แสดงจากการค้นหาไว้ไม่เกิน 8 รายการ
- รายละเอียดวิธีทดลอง ข้อจำกัด และตัวเลข benchmark อยู่ใน [ผลทดลอง Database Indexing Lab](./indexing-lab-results.md)

## แผนที่จะทำต่อ

1. **ตรวจและ apply migration สำหรับค้นหาอาหาร** — ทบทวน migration ในสภาพแวดล้อมทดสอบก่อน แล้ว apply `supabase/migrations/20261002_food_catalog_search_index.sql` ผ่าน Supabase Dashboard → SQL Editor เนื่องจากยังไม่มี direct database connection หรือ migration credentials ใน environment นี้
2. **ทดสอบการค้นหาหลัง migration** — ตรวจการค้นหาชื่อไทย/อังกฤษ การกรองหมวดหมู่ จำนวนผลลัพธ์ และ query plan; ยืนยันว่า RPC และ index ทำงานบน Supabase project จริง
3. **เตรียม production configuration** — ตั้งค่า URL, keys, allowed origins, HTTPS และ secure cookies ให้ตรงกับโดเมนที่จะ deploy โดยไม่ใส่ secret ลงใน frontend หรือ repository
4. **Deploy และตรวจรับระบบ** — ทดสอบ signup, email verification, login/session, password recovery, profile, food logs และ AI scan บน production configuration
5. **เตรียม operation ก่อนเปิดใช้งานจริง** — วาง monitoring, backup/restore และ distributed rate limiting หากต้องรองรับหลาย backend instances

ลำดับนี้ตั้งใจให้การเปลี่ยน schema และการยืนยันการค้นหาเกิดก่อนเปิดใช้ production search จากนั้นจึงตรวจรับทั้งแอปและความพร้อมในการดูแลระบบ

## สิ่งที่เตรียมไว้หรือเผื่อไว้

- **Migration แบบ additive:** เตรียม migration และ RPC สำหรับค้นหา พร้อม schema สำหรับ project ใหม่; migration ยังไม่ได้ apply กับ Supabase project จริง การมีไฟล์ migration ไม่ได้แปลว่า production พร้อมใช้งาน
- **รองรับข้อมูลเดิม:** วางแนวทางเพิ่ม `name_th` เป็น nullable ในอนาคต แล้วค่อย backfill คำแปลที่ตรวจสอบแล้วและเพิ่มการค้นหา/index โดยไม่บังคับให้ทุก record มีคำแปลทันที
- **Fallback สำหรับชื่อที่ยังไม่แปล:** frontend มี fallback ไปใช้ `name` สำหรับ record ที่ไม่มี `name_th`; ควรรักษาพฤติกรรมนี้ระหว่าง rollout
- **ไม่รบกวนหน้าที่ต้องใช้ catalog ทั้งหมด:** การเปลี่ยนเส้นทางค้นหาแบบมีคำค้นไม่ควรเปลี่ยนการโหลด catalog ทั้งหมดที่หน้าอื่นใช้อยู่
- **แผนเมื่อ migration ยังไม่พร้อม:** อย่าเปิดใช้ backend รุ่นที่ต้องพึ่ง RPC บน project ที่ยังไม่มี migration; ให้เลื่อน rollout จน apply และตรวจ migration สำเร็จ แทนการคาดหวังว่าจะ fallback อัตโนมัติ
- **ข้อจำกัด benchmark:** ตัวเลขมาจาก Docker บนเครื่องพัฒนาและข้อมูลสำเนา ไม่ใช่ SLA หรือผล latency ของ Supabase production; ควรวัดซ้ำบน project จริงก่อนสรุปผล
- **แผนระบบในอนาคต:** มีภาพ microservices เป็นแนวทางระยะยาว แต่ระบบปัจจุบันยังเป็น modular monolith จึงยังไม่ถือว่าแยก service หรือ deploy อย่างอิสระแล้ว

## ข้อควรระวัง

- ห้ามนำ `service_role` key หรือ secret key ไปไว้ใน frontend หรือ commit ลง repository
- ก่อน apply migration ควรตรวจ schema/function ปัจจุบันของ project และทดลองกับ environment ที่ไม่ใช่ production หากมี
- ควรแยกผล benchmark ในเครื่องออกจากผล production และบันทึก environment กับเงื่อนไขการวัดทุกครั้ง
- รายการงานและสถานะในเอกสารนี้ควรปรับเมื่อ migration, deployment หรือ production verification เสร็จจริง

## เอกสารที่เกี่ยวข้อง

- [README และวิธีรันโปรเจกต์](../README.md)
- [Architecture และสิ่งที่ยังต้องทำ](./architecture-and-tech-stack.md)
- [ผลทดลอง Database Indexing Lab](./indexing-lab-results.md)

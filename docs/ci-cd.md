# CI และ CD ของ NutriThai

Workflow อยู่ใน `.github/workflows/deploy.yml` ชื่อ **NutriThai CI/CD** รันเมื่อ push เข้า `main`, เปิดหรืออัปเดต Pull Request ที่มีปลายทางเป็น `main` และเมื่อกด Run workflow

## การตรวจโค้ด

| Job | การตรวจ |
| --- | --- |
| Frontend (Node 22 และ 24) | `npm ci`, TypeScript, Vitest พร้อม coverage และ Vite production build |
| Backend (Python 3.12 และ 3.14) | ติดตั้ง dependencies, Ruff ตรวจข้อผิดพลาด Python, pytest พร้อม coverage |
| Database migrations and RLS | PGlite ทดสอบ fresh install, upgrade, migration ที่รันซ้ำได้, catalog และสิทธิ์สองผู้ใช้ |
| Static website checks | ตรวจหน้าแรก ภาษาไทย ลิงก์ anchor ไฟล์อ้างอิง และ syntax ของ JavaScript |
| CI checks | รวมผลทุกกลุ่ม ต้องสำเร็จทั้งหมด แม้ job ก่อนหน้าล้มเหลวหรือถูกข้าม |

Frontend บังคับ coverage ของ statements และ lines อย่างน้อย 80% และคงเกณฑ์ branches กับ functions อย่างน้อย 70% ของโปรเจกต์เดิม Backend บังคับ coverage ของ `main.py` อย่างน้อย 80% รายงาน frontend และ backend ดาวน์โหลดได้จาก Artifacts ของ Actions โดยเก็บไว้ 7 วัน

Ruff ตรวจกลุ่ม E9, F63, F7 และ F82 ซึ่งจับ syntax error และข้อผิดพลาดที่อาจทำให้โปรแกรมรันไม่ได้ ส่วน frontend ใช้ TypeScript ตรวจชนิดข้อมูลและการอ้างอิงชื่อ ไม่เพิ่มกฎจัดรูปแบบให้ต้องแก้โค้ดเดิมทั้งโปรเจกต์

Tests ใช้ mock สำหรับบริการภายนอกและฐานข้อมูล PGlite ชั่วคราว จึงไม่ต้องมี Supabase/Gemini secrets และไม่เขียนข้อมูลลงฐาน production

## เงื่อนไขเผยแพร่

Job `Deploy GitHub Pages` มี `needs: checks` และทำงานเฉพาะเหตุการณ์ที่ไม่ใช่ Pull Request บน `refs/heads/main` ดังนั้นถ้าการตรวจใดไม่ผ่าน จะไม่เผยแพร่เว็บ และ PR จะตรวจอย่างเดียว

สิทธิ์อ่าน repository เป็นค่าเริ่มต้น เฉพาะ job deploy เท่านั้นที่มี `pages: write` และ `id-token: write` การรันของแต่ละ branch/PR แยก concurrency group เพื่อไม่ให้ PR ยกเลิกการตรวจของ main

เว็บไซต์ที่เผยแพร่ยังเป็นหน้าแนะนำผลงานใน `pages/` การ build frontend เป็นการตรวจว่าแอป React สร้างได้ ส่วน FastAPI และฐานข้อมูลต้อง deploy บน hosting แยก หากต้องการเปิดแอปเต็มออนไลน์

## ป้องกัน main

ชื่อ check ที่ใช้สำหรับ branch protection คือ **CI checks** ชื่อนี้คงเดิมแม้เพิ่มเวอร์ชันใน Matrix

ตั้ง rule ของ `main` ให้ต้องผ่าน Pull Request และ required status check `CI checks` ปิด Require approvals สำหรับผู้พัฒนาคนเดียว และเปิดบังคับกฎกับผู้ดูแล repository ด้วย การ merge PR ที่ผ่านแล้วจะทำให้เกิด push เข้า main และเริ่ม CD

## คำสั่งตรวจในเครื่อง

```powershell
# Frontend จากโฟลเดอร์ frontend
npm ci
npm run typecheck
npm run test:coverage
npm run build

# Backend จากโฟลเดอร์ backend ใน Python virtual environment
python -m pip install -r requirements-dev.txt
python -m ruff check --select E9,F63,F7,F82 .
python -m pytest --cov=main --cov-report=term-missing --cov-fail-under=80

# Database จากโฟลเดอร์ database-tests
npm ci
npm test

# Static Pages จาก root
python .github/scripts/check_pages.py
node --check pages/script.js
```

ไม่ commit `node_modules`, `.venv`, coverage, build output หรือข้อมูลลับลง repository เมื่อ test ล้มเหลวให้อ่าน log ของ step สีแดง แก้บน branch เดิมแล้ว push เพื่อให้ PR ตรวจใหม่

# NutriThai Calorie App

เว็บแอปติดตามโภชนาการสำหรับอาหารไทย ช่วยคำนวณเป้าหมายพลังงาน บันทึกอาหารรายวัน วิเคราะห์รูปอาหารด้วย Gemini และดูแนวโน้มสุขภาพย้อนหลัง

## อัปเดตข้อ 1–4 (9 ตุลาคม 2026)

เพิ่มหน่วยอาหารและแปลงปริมาณ อาหารส่วนตัว และแก้บันทึกครบทุกช่อง พร้อม migration และการทดสอบ
**อ่าน [คู่มือติดตั้งข้อ 1–4](docs/steps-1-4-setup.md) ก่อนเริ่มแอปรุ่นนี้** ต้อง apply migration บน Supabase เดิมก่อน
การ apply/ตรวจ Supabase จริงยังไม่เสร็จในสภาพแวดล้อมนี้

## System Overview

```text
Frontend (React UI)
        |
        +---- Backend API (FastAPI; HttpOnly session cookies)
                    |
                    +---- Supabase Auth + PostgreSQL (profiles, foods, custom_foods, food_logs)
                    +---- Gemini Vision API (optional)
```

- **Frontend**: React 19, TypeScript, Vite 8 และ Tailwind CSS v4
- **Database/Auth**: Supabase PostgreSQL, Supabase Auth และ Row Level Security
- **Backend**: Python FastAPI สำหรับ authentication, validation, data access, Supabase และ Gemini
- **AI**: Gemini Vision ผ่าน backend เท่านั้น
- **Default frontend URL**: `http://localhost:8443`
- **Backend URL**: `http://localhost:8000`
- **Architecture และ self-assessment**: [docs/architecture-and-tech-stack.md](./docs/architecture-and-tech-stack.md)
- **ผลทดลอง Database Indexing Lab**: [docs/indexing-lab-results.md](./docs/indexing-lab-results.md)
- **สถานะโปรเจกต์และแผนดำเนินงานต่อ**: [docs/project-status-and-next-steps.md](./docs/project-status-and-next-steps.md)

> ปัจจุบัน backend เป็น FastAPI modular monolith ที่ทำงานร่วมกับ frontend, Supabase Auth/PostgreSQL และ Gemini API; ยังไม่ใช่ชุด microservices ที่ backend แต่ละส่วนแยก deploy อย่างอิสระ

## Features

### Authentication

- Sign in ด้วย Email และ Password
- Create account ด้วย Username, Email และ Password
- Continue as Guest โดยไม่ต้องมี account
- ข้อมูลของบัญชีบันทึกใน Supabase; Guest ใช้ข้อมูลใน memory และหายเมื่อ refresh หรือออกจากระบบ
- Session คงอยู่หลัง refresh ผ่าน HttpOnly cookies ที่ backend จัดการ
- Password show/hide control
- ลืมรหัสผ่านทางอีเมล และตั้งรหัสผ่านใหม่จากลิงก์ Supabase

### Health Profile

ผู้ใช้ใหม่จะตั้งค่า Health Profile ก่อนเริ่มใช้งาน:

- Gender
- Body metrics: Weight, Height, Age
- Activity Level
- Goal: Weight loss, Maintenance หรือ Muscle gain
- คำนวณ BMR, TDEE, Calorie goal และ Macro goals แบบ realtime
- แก้ไขข้อมูลได้จาก User menu

### Overview Dashboard

- Calorie ring แสดง Calories consumed และ Remaining
- แสดง Goal, Consumed และ Remaining
- Macro breakdown สำหรับ Protein, Carbs และ Fats
- แสดงรายการอาหารแยกตามมื้อ
- Quick action สำหรับเริ่มบันทึกอาหาร
- Dashboard แสดงข้อมูลเฉพาะวันปัจจุบัน

### Food Log

- ค้นหาอาหารจากชื่อไทยหรือ English
- Category filter: `All`, `Meals`, `Desserts`, `Drinks`
- Popular choices เมื่อยังไม่มีคำค้นหา
- เลือก Meal date เพื่อบันทึกย้อนหลัง
- เลือก Meal type และปริมาณตามหน่วยอ้างอิง (กรัม/มิลลิลิตร/portion); แปลง portion เป็นกรัมเมื่อมีน้ำหนักจริง
- เพิ่มอาหารส่วนตัวจากฉลากและเลือกใช้ซ้ำได้
- รองรับอาหารไทย ของหวาน และเครื่องดื่ม
- เก็บข้อมูลใน Supabase สำหรับผู้ใช้ที่ลงชื่อเข้าใช้; Guest ใช้ข้อมูลใน memory

### Gemini Food Scan

- เลือกรูปอาหารจริงจาก `JPEG`, `PNG` หรือ `WebP`
- แสดง image preview ก่อนส่งวิเคราะห์
- ต้องยินยอมก่อนเลือกและส่งรูปไปยัง backend และ Google Gemini
- Gemini วิเคราะห์ชื่ออาหาร Calories, Protein, Carbs และ Fats
- แสดง AI confidence และคำแนะนำ
- แก้ไขผลวิเคราะห์ได้ก่อนกด Add to log
- ถ้าไม่มี Gemini API key ระบบจะแจ้ง error อย่างชัดเจน

### Meal History

- เลือกวันจาก date picker
- แสดงรายการอาหารของแต่ละวัน
- สรุป Calories, Protein, Carbs และ Fats รายวัน
- Quick date buttons สำหรับวันที่มีข้อมูล
- ลบรายการย้อนหลัง และแก้อาหาร/ชื่อ/โภชนาการเฉพาะรายการ/มื้อ/วันที่/ปริมาณได้
- ข้อมูล log ของบัญชียังคงอยู่หลัง refresh ผ่าน Supabase

### Health Insights

- สรุปจำนวนวันที่บันทึก ค่าเฉลี่ยแคลอรี และวันที่เกินเป้าหมาย
- กราฟวันจันทร์–อาทิตย์ของสัปดาห์ปัจจุบัน
- สารอาหารที่บันทึกวันนี้
- เมนูทดแทนจาก catalog เฉพาะข้อมูลที่เปรียบเทียบหน่วย/ปริมาณอ้างอิงกันได้
- คำแนะนำมื้อถัดไปและการออกกำลังกายยังไม่ได้ยืนยันว่ามี flow ครบในโค้ด ZIP ที่ใช้พัฒนารอบนี้

### Product Experience

- หน้าหลัก 5 ส่วน: Today, Add Food, Food History, AI Food Scan และ Insights
- ส่วนติดต่อผู้ใช้ภาษาไทย ออกแบบ mobile-first พร้อม desktop navigation
- หน้าลงชื่อเข้าใช้และสมัครสมาชิกในหน้าเดียว พร้อมโหมด Guest
- Onboarding และแก้ไข Health Profile แบบ 3 ขั้นตอน
- Responsive layout สำหรับ desktop และ mobile
- Accessible labels, focus states และ reduced-motion support
- Preview รูปอาหารและตรวจ/แก้ไขผลจาก Gemini ก่อนบันทึก

## Project Structure

```text
.
├── backend/
│   ├── main.py              # FastAPI Gemini endpoint และ Supabase JWT verification
│   ├── requirements.txt     # Python dependencies
│   ├── requirements-dev.txt # Backend test dependencies
│   └── Dockerfile.txt
├── supabase/
│   └── schema.sql           # PostgreSQL schema and Row Level Security
├── frontend/
│   ├── index.html           # Vite HTML shell
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── App.tsx
│       ├── types.ts
│       ├── index.css
│       ├── lib/health.ts
│       ├── lib/foodLogs.ts
│       ├── lib/api.ts
│       └── components/
├── docker-compose.yaml
├── .env.example
└── beta1.zip                # Snapshot ก่อนการปรับปรุงชุดใหญ่
```

## Local Development

### Supabase Setup

1. รัน `supabase/schema.sql` ใน Supabase Dashboard → SQL Editor
2. หาก project มี schema เดิมอยู่แล้ว ให้รัน migration `supabase/migrations/20261002_food_catalog_search_index.sql` ใน Supabase Dashboard → SQL Editor เพื่อสร้าง trigram indexes และ RPC สำหรับค้นหารายการอาหาร
3. จัดเตรียม catalog ในตาราง `public.foods` ผ่านกระบวนการจัดการข้อมูลของ Supabase; แอปค้นหารายการผ่าน backend API และไม่มี CSV/local catalog fallback
4. เปิด Supabase Authentication และกำหนด Site URL/redirect URLs ให้ตรงกับเว็บที่จะใช้งาน ถ้าเปิดยืนยันอีเมล ผู้ใช้ต้องยืนยันอีเมลก่อนมี session

ตั้งค่า Supabase URL และ **publishable key** ไว้ใน backend environment เท่านั้น; frontend เรียก API ของ backend และไม่มี Supabase client/key

### Frontend
```powershell
Set-Location frontend
npm install
npm run dev
```

เปิด `http://localhost:8443`

### Backend

สำหรับ local development ตั้ง environment variables ก่อนเริ่ม backend:

```powershell
Set-Location backend
pip install -r requirements.txt
$env:SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co"
$env:SUPABASE_PUBLISHABLE_KEY = "YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY"
$env:AUTH_COOKIE_SECURE = "false"
$env:FRONTEND_ORIGINS = "http://localhost:8443,http://127.0.0.1:8443"
$env:GEMINI_API_KEY = "YOUR_GEMINI_API_KEY"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

หากเก็บค่าจริงไว้ใน `.env` ที่ project root ให้รัน `start_local.bat` จาก root เพื่อโหลด environment และเปิด backend, Vite frontend และ ngrok (ถ้าติดตั้งไว้) อัตโนมัติ หน้าเว็บ local อยู่ที่ `http://localhost:8443`

API documentation อยู่ที่:

- `http://localhost:8000/docs`
- `http://localhost:8000/redoc`

### Docker Compose

สร้างไฟล์ `.env` ที่ project root จาก `.env.example` แล้วใส่ Supabase URL/publishable key และ Gemini key หากจะใช้ image scan:

```env
SUPABASE_URL=https://YOUR_PROJECT_ID.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLIC_PUBLISHABLE_OR_ANON_KEY
AUTH_COOKIE_SECURE=false
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
FRONTEND_ORIGINS=http://localhost:3000,http://localhost:8443,http://127.0.0.1:8443
```

publishable key ถูกใช้โดย backend เท่านั้น; ห้ามใช้ `service_role`/secret key ในแอปนี้
กำหนด `FRONTEND_ORIGINS` เป็น origin จริงของเว็บเมื่อ deploy และเปลี่ยน `AUTH_COOKIE_SECURE=true` เมื่อใช้ HTTPS

จากนั้นรัน:

```powershell
docker compose up --build
```

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## API Summary

Frontend สื่อสารกับ FastAPI ผ่าน `/api/v1/*` เท่านั้น; FastAPI เป็นตัวเชื่อม Supabase Auth, PostgREST และ Gemini โดยใช้ HttpOnly cookies สำหรับ session
Backend ตรวจสอบ Supabase access token และส่งต่อคำขอฐานข้อมูลด้วย token ของผู้ใช้ เพื่อให้ Supabase RLS จำกัดข้อมูลตามบัญชี
ใน production ต้องใช้ HTTPS และตั้ง `AUTH_COOKIE_SECURE=true`; แนะนำให้เผยแพร่ frontend/API ภายใต้ same-origin ผ่าน reverse proxy

API หลักประกอบด้วย Authentication, profile, foods, food logs และ image scan; ดู schema/รายละเอียด request ได้ที่ `http://localhost:8000/docs`

### User Management API

| Method | Endpoint | หน้าที่ |
|---|---|---|
| `GET` | `/api/v1/users/me` | อ่าน id, email และ username ของผู้ใช้ที่ยืนยันตัวตนแล้ว |
| `PUT` | `/api/v1/users/me` | สร้างหรือแก้ Health Profile ของผู้ใช้ปัจจุบัน (ใช้ validation และ schema เดียวกับ `/api/v1/profile`) |

ทั้งสอง endpoint ใช้ Supabase access token ของผู้ใช้ปัจจุบัน; ผู้ใช้แก้ไขได้เฉพาะโปรไฟล์ของตนเอง ไม่มี endpoint สำหรับแจกแจงหรือจัดการบัญชีผู้อื่น เพราะระบบนี้ไม่มีงาน admin user management

## Gemini Setup

1. สร้าง Gemini API key จาก Google AI Studio
2. ใส่ key ใน `.env` ที่ root ด้วยชื่อ `GEMINI_API_KEY`
3. Restart backend หรือ `docker compose up --build`
4. เปิด Food Log แล้วเลือกแท็บ Scan
5. เลือกรูปอาหารและตรวจสอบผลก่อนบันทึก

API key ต้องอยู่ใน backend environment เท่านั้น ห้ามใส่ใน frontend หรือ commit ลง repository

## Data and Privacy Notes

- ข้อมูลบัญชีผู้ใช้และ food logs จัดเก็บใน Supabase และอ่าน/เขียนตาม RLS
- Frontend ไม่มี Supabase credentials/client หรือ session token; browser ส่ง HttpOnly cookies ให้ backend โดยอัตโนมัติ
- Guest log อยู่เฉพาะใน memory ของ session; ข้อมูล log เก่าจาก localStorage จะถูกล้าง
- รูปอาหารจะถูกส่งไปยัง backend และ Gemini เมื่อผู้ใช้กดวิเคราะห์
- AI scan ต้องมี session ที่ยืนยันกับ Supabase; backend ตรวจ token ผ่าน Supabase JWKS ก่อนรับภาพ
- ควรแจ้งผู้ใช้และขอ consent ก่อนส่งรูปไปยัง external AI service
- `supabase/schema.sql` สร้างตารางและ RLS; catalog `foods` อ่านได้สาธารณะและ client แก้ไขไม่ได้

## Current Limitations

- ต้องรัน schema และจัดเตรียมรายการอาหารในตาราง Supabase `public.foods` ก่อนใช้การค้นหาอาหาร; frontend และโหมด Guest โหลด catalog ผ่าน backend API เท่านั้น
- ต้องใส่ project URL และ key จริงใน environment ของ local/deployment
- Supabase JWT สำหรับ Gemini endpoint ต้องใช้ signing key แบบ asymmetric (ES256 หรือ RS256) ที่เผยแพร่ผ่าน JWKS
- ต้องตั้ง `GEMINI_API_KEY` เพื่อใช้ image scan
- รีเซ็ตรหัสผ่านต้องเพิ่ม URL ของเว็บใน Supabase Authentication → URL Configuration → Redirect URLs
- ข้อมูลอาหารเดิมที่ไม่มีหน่วยยังแสดง “หน่วยเดิม (ไม่ระบุขนาด)” ต้องตรวจแหล่งอ้างอิงก่อน backfill metadata; ไม่เปลี่ยนค่าโภชนาการเก่าอัตโนมัติ
- ยังไม่มี cloud hosting/production deployment ที่ผูกกับ project/โดเมนจริง
- Gemini scan จำกัดเริ่มต้น 10 ครั้งต่อผู้ใช้ต่อชั่วโมง (`GEMINI_RATE_LIMIT_REQUESTS`, `GEMINI_RATE_LIMIT_WINDOW_SECONDS`) และ Nginx จำกัด API ที่ 30 request/นาทีต่อ IP พร้อม burst 10; limiter ใน backend เก็บใน memory จึงไม่แชร์ข้าม worker/replica และรีเซ็ตเมื่อ restart ควรใช้ distributed/API-gateway rate limit ก่อนเปิด production
- Frontend coverage ครอบคลุม source TypeScript/TSX ทั้งหมด โดยตั้ง threshold แยกอย่างน้อย 70% สำหรับ statements, branches, functions และ lines
- ผลทดสอบรอบนี้: Frontend 50 tests ผ่าน; coverage statements 86.81%, branches 78.28%, functions 80.74%, lines 88.14%; Backend 47 tests ผ่าน และ coverage 92.46% (ไม่ใช่การรับประกันว่าไม่มีบั๊ก)
- ค่าโภชนาการจาก Gemini เป็นค่าประมาณ ผู้ใช้ควรตรวจสอบ portion size

## Validation

คำสั่งตรวจสอบ frontend:

```powershell
Set-Location frontend
npm.cmd run build
.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json
npm.cmd test
npm.cmd run test:coverage
```

Backend tests:

```powershell
Set-Location backend
pip install -r requirements-dev.txt
python -m pytest --cov=main --cov-fail-under=80
```

ใช้ `python -m pytest --cov=main --cov-fail-under=80` เพื่อตรวจ backend coverage; frontend `npm run test:coverage` รันทดสอบ source ทั้งหมดและบังคับ coverage อย่างน้อย 70% ในทุก metric

Docker configuration: `docker compose config`

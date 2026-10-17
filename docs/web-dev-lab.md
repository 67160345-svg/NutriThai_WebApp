# แลป GitHub Actions และ GitHub Pages สำหรับ NutriThai

ผู้จัดทำ: นพรัตน์ โพธิ์สาวัง รหัสนิสิต 67160345

- Repository: https://github.com/67160345-svg/NutriThai_WebApp
- เว็บไซต์: https://67160345-svg.github.io/NutriThai_WebApp/
- Actions: https://github.com/67160345-svg/NutriThai_WebApp/actions/workflows/deploy.yml

## ผลงานตามโจทย์

หน้าเว็บใน `pages/` มี About Me, Skills และ Contact ใช้ข้อมูลผู้จัดทำจริง พร้อมปุ่ม Say Hello ที่เปลี่ยนข้อความบนหน้าเว็บ และปุ่มสลับธีมสว่าง/มืดซึ่งจดจำค่าบนอุปกรณ์เมื่อเบราว์เซอร์อนุญาต ภาพ Dashboard เป็นภาพตัวอย่างจากโปรเจกต์เดิม

เว็บไซต์นี้ใช้ HTML, CSS และ JavaScript โดยตรง ไม่ต้องติดตั้ง npm ส่วนแอปเต็มใน `frontend/` และ `backend/` ยังต้องใช้ FastAPI, Supabase และการตั้งค่า environment แยกต่างหาก GitHub Pages เผยแพร่เฉพาะเว็บไซต์แนะนำผลงานใน `pages/`

## Workflow ทำงานอย่างไร

Workflow `.github/workflows/deploy.yml` เริ่มทุกครั้งที่มี push ไปยัง branch `main` หรือกด Run workflow ด้วยตนเอง Job `deploy` ใช้เครื่อง Ubuntu ดาวน์โหลดโค้ดด้วย checkout ตรวจว่าไฟล์หน้าแรก CSS JavaScript และภาพมีอยู่ ตรวจ syntax ของ JavaScript แล้วตั้งค่า Pages อัปโหลดเฉพาะโฟลเดอร์ `pages` เป็น artifact และเผยแพร่ artifact นั้นไปยัง GitHub Pages

`contents: read` ใช้อ่านโค้ด, `pages: write` ใช้เผยแพร่เว็บไซต์ และ `id-token: write` ใช้ยืนยันตัวตนของการ deploy ผ่าน OIDC ส่วน concurrency ป้องกัน deployment ซ้อนกัน โดยยกเลิกงานเดิมเมื่อมีงานใหม่

ขั้นตอน `test -f pages/index.html` เป็น Challenge ตรวจไฟล์ก่อน deploy หากไฟล์หาย Job จะหยุดก่อนอัปโหลด ไม่เผยแพร่ root ของ repository จึงไม่รวม backend, ฐานข้อมูล หรือโฟลเดอร์ secrets ในเว็บไซต์

ตั้งค่า Repository → Settings → Pages → Source เป็น **GitHub Actions** หนึ่งครั้ง แล้วการ push ครั้งถัดไปจะเผยแพร่อัตโนมัติ

## ทดสอบ Continuous Deployment

1. รอ Workflow ครั้งแรกผ่าน แล้วเปิด URL เว็บไซต์ ตรวจหัวข้อ สีปุ่ม ปุ่ม Say Hello และปุ่มเปลี่ยนธีม
2. แก้ข้อความ `h1` ใน `pages/index.html` และสีปุ่ม `.primary` ใน `pages/style.css`
3. Commit และ push ไปยัง `main` ตรวจว่าเกิด Actions run ใหม่ และรอจนสถานะเป็น Success
4. Refresh เว็บไซต์ ตรวจว่าหัวข้อและสีเปลี่ยนตาม commit ล่าสุด ถ้าแคชยังค้างให้ Hard Refresh

ตัวอย่างคำสั่งเมื่อ clone repository และติดตั้ง Git แล้ว:

```sh
git clone https://github.com/67160345-svg/NutriThai_WebApp.git
cd NutriThai_WebApp
# แก้ไฟล์ใน pages/ แล้วจึงรันคำสั่งต่อไปนี้
git add pages/index.html pages/style.css
git commit -m "Update home page design"
git push origin main
```

## คำตอบคำถามท้ายแลป

1. **GitHub Actions แตกต่างจาก GitHub Pages อย่างไร?** Actions เป็นระบบทำงานอัตโนมัติตาม Workflow เช่น ตรวจไฟล์ ทดสอบ และ deploy ส่วน Pages เป็นบริการโฮสต์ไฟล์เว็บ Static ให้เปิดผ่าน URL ได้ Git ใช้เก็บประวัติเวอร์ชันบนเครื่อง และ GitHub ใช้เก็บ repository ออนไลน์
2. **เหตุใดจึงเลือก trigger ด้วย push ที่ branch main?** เพราะ main เป็น branch ที่ใช้เผยแพร่ผลงาน เมื่อโค้ดที่พร้อมใช้งานเข้ามาใน branch นี้ เว็บไซต์จะอัปเดตตามโดยไม่ต้องอัปโหลดไฟล์ด้วยตนเอง
3. **ถ้าแก้ไฟล์ในเครื่องแต่ไม่ได้ push เว็บไซต์จะเปลี่ยนหรือไม่?** ไม่เปลี่ยน เพราะ GitHub ยังไม่ได้รับ commit ที่แก้ไข และไม่มี push event เพื่อเริ่ม Workflow แม้ commit บนเครื่องแล้วก็ต้อง push ก่อน
4. **เหตุใด PHP + MySQL จึงรันบน GitHub Pages โดยตรงไม่ได้?** Pages ให้บริการไฟล์ Static และไม่มี PHP runtime หรือ MySQL server โค้ดฝั่ง server ต้อง deploy บน hosting ที่รองรับ สำหรับ NutriThai ใช้ FastAPI ซึ่งต้องมี server แยกด้วยเหตุผลเดียวกัน
5. **ค้นหาสาเหตุเมื่อ Workflow Failed อย่างไร?** เปิด Actions เลือก run ที่ล้มเหลว เปิด job deploy และ step สีแดง อ่าน error ใน log จากนั้นตรวจตำแหน่งไฟล์และ YAML, branch, Pages Source และ permissions ตามข้อความผิดพลาด แก้ไขแล้ว commit/push ใหม่ และตรวจทั้ง run ล่าสุดกับเว็บไซต์จริง

## หลักฐานส่งงาน

แนบ URL Repository และ URL เว็บไซต์ด้านบน พร้อมภาพ Actions run ที่มีสถานะ Success และภาพเว็บไซต์ที่แสดงชื่อ รหัสนิสิต และการปรับแต่งหน้าเว็บ ใช้ run จริงของ commit ล่าสุดเป็นหลักฐาน ห้ามใช้ภาพสถานะจำลอง

## เอกสารอ้างอิง

- https://docs.github.com/en/actions
- https://docs.github.com/en/pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages

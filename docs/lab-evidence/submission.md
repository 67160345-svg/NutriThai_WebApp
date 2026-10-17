# หลักฐานแลป GitHub Actions และ GitHub Pages

ชื่อ: นพรัตน์ โพธิ์สาวัง

รหัสนิสิต: 67160345

- Repository: https://github.com/67160345-svg/NutriThai_WebApp
- GitHub Pages: https://67160345-svg.github.io/NutriThai_WebApp/
- Workflow ล่าสุด: https://github.com/67160345-svg/NutriThai_WebApp/actions/runs/39016349376
- Workflow ทดสอบ Continuous Deployment: https://github.com/67160345-svg/NutriThai_WebApp/actions/runs/39016279002
- คำตอบท้ายแลปและคำอธิบาย Workflow: ../web-dev-lab.md

## การทดสอบ Continuous Deployment วันที่ 17 ตุลาคม 2026

ครั้งแรกเผยแพร่หัวข้อ “กินดีขึ้นอีกนิด เริ่มที่ความเข้าใจ” ด้วย commit e930a28414e83a0c10c658d73adc5c94e60224d1

จากนั้นเปลี่ยนหัวข้อเป็น “ทุกมื้อที่เลือก ดีขึ้นได้อีกนิด” และสีพื้นปุ่มจาก #233a30 เป็น #2f5940 ด้วย commit e7328ad028dfa6206bbbef16868a802865eddf43 การ push ไป main เริ่ม Workflow ใหม่อัตโนมัติ และตรวจพบหัวข้อใหม่บนเว็บไซต์จริง

เพิ่มเวอร์ชันใน URL ของ CSS และ JavaScript ด้วย commit cdb7c3b495a364fb290e40a50455531522fbd589 เพื่อให้เบราว์เซอร์โหลดไฟล์ชุดใหม่หลังการอัปเดต

## ไฟล์หลักฐาน

- actions-success.jpg: สถานะ Success ของ GitHub Actions
- website-desktop.jpg: หน้าเว็บไซต์ที่เผยแพร่แล้ว
- website-about.jpg: หน้า About Me ที่แสดงชื่อและรหัสนิสิต
- website-mobile.jpg: ตรวจหน้าเว็บมือถือขนาด 390 พิกเซล
- before-update.jpg: เว็บไซต์ก่อนเปลี่ยนหัวข้อและสีปุ่ม

## ขอบเขตการตรวจ

ตรวจ JavaScript syntax, ลิงก์ภายในหน้า, ไฟล์ประกอบ, การแสดงผลเดสก์ท็อปและมือถือ, ปุ่มทักทาย, ปุ่มเปลี่ยนธีม และการจำธีมหลังรีเฟรช ตรวจการเผยแพร่ผ่าน Workflow และเว็บไซต์ออนไลน์จริง ส่วน backend ของแอปเต็มไม่ได้เป็นส่วนหนึ่งของ GitHub Pages deployment นี้

?????????????: Workflow #3 ??????? Success ??????????????????????????????? rgb(47, 89, 64) ?????? #2f5940 ??? Dashboard ?????????? ??????????????? 390 ???????????????????????????

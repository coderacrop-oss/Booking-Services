# ระบบจอง 4 ธุรกิจ · LINE OA เดียว

Pet hotel · Villa · สระน้องหมา · Grooming
Next.js (Vercel) + Supabase (Postgres, Storage) + LINE LIFF / Messaging API

> สถานะ: **ขั้นที่ 1 ฐานข้อมูล** เสร็จแล้ว · ขั้นต่อไป: โครง Next.js + แยกจอจากโปรโตไทป์

## โครงโปรเจกต์

```
data/BaanMax-booking-schema.xlsx   ไฟล์ตั้งค่าร้าน + ข้อมูลทดลอง (แก้ที่นี่)
scripts/excel_to_seed.py           แปลง Excel → supabase/seed.sql (ตรวจข้อมูลก่อน)
supabase/migrations/               โครงฐานข้อมูล (รันตามลำดับชื่อไฟล์)
  …0100_core.sql                   20 ตาราง + กันจองซ้อน
  …0200_rules.sql                  กติกาที่ฐานข้อมูลบังคับเอง + ฟังก์ชันช่วย
  …0300_security.sql               สิทธิ์ (RLS)
  …0400_storage.sql                ที่เก็บรูป / สลิป / วัคซีน
  …0500_phase2.sql                 บัตรสระ · โค้ดส่วนลด (เฟส 2)
supabase/seed.sql                  สร้างจากสคริปต์ ห้ามแก้ตรง
tests/db_test.sql                  ทดสอบกติกา 31 ข้อ (rollback ไม่ทิ้งข้อมูล)
tests/supabase_stub.sql            ใช้ทดสอบบน Postgres เปล่าเท่านั้น
```

## ตั้งค่าร้าน / import ข้อมูล

1. แก้ไฟล์ `data/BaanMax-booking-schema.xlsx`
   - 🟩 ตั้งค่าร้าน · 🟦 ข้อมูลลูกค้า · 🟧 การจองและเงิน · ⬜ ระบบ · 🩷 เฟส 2
   - แถว 2 คือชื่อคอลัมน์ในฐานข้อมูล ห้ามแก้ · ข้อมูลเริ่มแถว 3
2. สร้าง seed
   ```bash
   pip install openpyxl
   python3 scripts/excel_to_seed.py data/BaanMax-booking-schema.xlsx > supabase/seed.sql
   # ขึ้นระบบจริง เอาเฉพาะตั้งค่าร้าน (ไม่เอาลูกค้า/การจองสมมติ)
   python3 scripts/excel_to_seed.py data/BaanMax-booking-schema.xlsx --setup-only > supabase/seed.sql
   ```
   ถ้าข้อมูลผิด สคริปต์บอกชื่อแท็บและแถวให้แก้ แล้วไม่สร้างไฟล์

### ที่ฐานข้อมูลต่างจาก Excel (สคริปต์แปลงให้)

| Excel | ฐานข้อมูล |
|---|---|
| วันในสัปดาห์ `จ,อ,พ,พฤ,ศ,ส,อา` | `smallint[]` 1 = จันทร์ … 7 = อาทิตย์ |
| `bookings.pet_codes` | ตาราง `booking_pets` |
| `bookings.unit_code` ที่เป็นรหัสรอบสระ | `bookings.session_code` (+ `unit_code` ของสระเติมเอง) |
| `bookings.service_code` ที่มีบริการเสริม `G-BATH,A-NAIL` | `service_code` + `addon_codes` |
| `unit_photos.owner_code` | `unit_code` หรือ `service_code` |
| `closures.unit_code` ที่เป็นรหัสรอบสระ | `closures.session_code` |
| เวลา `2026-11-21 10:00` | `timestamptz` เวลาไทย (+07) |
| `staff.line_user_id` | ไม่ import · ผูกตอนพนักงานกดลิงก์เชิญเท่านั้น |

## รันบน Supabase

ต้องมี [Supabase CLI](https://supabase.com/docs/guides/cli) และ Docker (สำหรับเครื่องตัวเอง)

```bash
supabase init                 # ครั้งแรก (ถ้ายังไม่มี supabase/config.toml)
supabase start                # Supabase ในเครื่อง
supabase db reset             # รัน migrations + seed.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f tests/db_test.sql
```

ขึ้นโปรเจกต์ทดสอบบน Supabase (ไม่ใช่ตัวจริงของร้าน):

```bash
supabase link --project-ref <ref ของโปรเจกต์ทดสอบ>
supabase db push
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
psql "$SUPABASE_DB_URL" -f tests/db_test.sql
```

ผลที่ต้องได้: ทุกบรรทัดขึ้น `PASS` และจบด้วย `ผ่านครบทุกข้อ`

## กติกาที่ฐานข้อมูลบังคับเอง

- ห้อง/บ้านเดียวกัน ช่วงเวลาทับกันไม่ได้ (ออก 12:00 เข้า 12:00 ได้)
- ช่างคนเดียว คิวทับกันไม่ได้
- รอบสระรับไม่เกินจำนวนตัว · ล็อกรอบกันสองคนกดพร้อมกันแล้วเกิน
- น้องต้องขนาดตรงรอบ (เล็ก ≤ 10 กก. · ใหญ่ > 10 กก.)
- ธุรกิจที่ต้องมีวัคซีน: น้องต้องมีวัคซีนที่พนักงานตรวจผ่านและยังไม่หมดอายุ ณ วันใช้บริการ
- น้องต้องเป็นของเจ้าของทริป · Villa ไม่เกินจำนวนคน · รอบสระต้องตรงวันและเวลา
- ไม่แนบสลิปตามเวลา `expire_holds()` ปล่อยที่ให้คนอื่น (เรียกจากรอบตั้งเวลาทุก 5 นาที)

## สิทธิ์

- หน้าเว็บใช้ anon key อ่านได้เฉพาะข้อมูลร้าน (ธุรกิจ ห้อง บริการ ราคา รอบ วันปิด)
- ลูกค้า การจอง สลิป วัคซีน พนักงาน: ผ่าน API ฝั่ง server เท่านั้น (ตรวจ LINE ID token แล้วใช้ service role)
- token และค่าลับอยู่ใน env ของ Vercel/Supabase เท่านั้น ห้ามใส่ใน Excel หรือ commit

## env

ดู `.env.example`

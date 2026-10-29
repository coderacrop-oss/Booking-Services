# ระบบจอง 4 ธุรกิจ · LINE OA เดียว

Pet hotel · Villa · สระน้องหมา · Grooming
Next.js (Vercel) + Supabase (Postgres, Storage) + LINE LIFF / Messaging API

> สถานะ
> - ขั้นที่ 1 ฐานข้อมูล ✓
> - ขั้นที่ 2 หน้าจองลูกค้า 4 ธุรกิจ + หลังบ้าน (อ่านอย่างเดียว) ✓ · ดูที่ว่างและคิดราคาจากฐานข้อมูลจริง
> - ขั้นที่ 3a LINE Login (LIFF) + PDPA · จองจริง + กันที่ · QR พร้อมเพย์ + แนบสลิป · ร้านตรวจสลิป · การจองของฉัน · ส่ง LINE ✓
> - ขั้นที่ 3b (ต่อไป): ทริปจ่ายรวมข้ามธุรกิจ · ส่ง/ตรวจวัคซีน · เชิญพนักงานด้วย LINE · อีเมล + Google Calendar · แจ้ง Grooming เสร็จ

## รันหน้าเว็บ (ขั้นที่ 2)

```bash
npm install
cp .env.example .env.local      # ใส่ SUPABASE_DB_URL + DEMO_MODE=1 สำหรับเครื่อง dev
npm run dev                     # http://localhost:3000
./scripts/smoke_api.sh          # ทดสอบ API กับข้อมูล seed (14 ข้อ)
```

| หน้า | ใช้ทำอะไร |
|---|---|
| `/` | รวม 4 ธุรกิจ |
| `/b/pet_hotel` `/b/villa` `/b/pool` `/b/grooming` | หน้าจองของแต่ละธุรกิจ (ริชเมนูแต่ละอันเปิด LIFF มาที่นี่) |
| `/admin?date=2026-11-21` | หลังบ้าน: การจองของวันนั้นแยกตามธุรกิจ |
| `GET /api/availability` | ที่ว่าง: ห้อง/บ้าน (stay) · รอบสระ (session) · คิวช่าง (slot) |
| `POST /api/quote` | คิดราคาและมัดจำที่ server (หน้าจอแค่แสดง) |

- ต่อฐานข้อมูลจาก server ด้วย `SUPABASE_DB_URL` (บน Vercel ใช้ pooler port 6543)
- `DEMO_MODE=1` ใช้ลูกค้าสมมติ (`DEMO_CUSTOMER`) และเปิดหลังบ้านโดยไม่ล็อกอิน — **ห้ามเปิดบนระบบจริง** ขั้นที่ 3 เปลี่ยนเป็น LINE Login

## ขั้นที่ 3a: จองจริงจนร้านยืนยัน

```
ลูกค้าเปิด LIFF → ล็อกอิน LINE (server ตรวจ ID token กับ LINE) → ยอมรับ PDPA ครั้งแรก
→ เลือกบริการ → ติ๊กยอมรับเงื่อนไข → ชำระเงิน = สร้างทริป สถานะ holding กันที่ hold_minutes นาที
→ หน้า /pay/<ทริป>: QR พร้อมเพย์ตามยอดมัดจำ + นับถอยหลัง → แนบสลิป (ตรวจว่าเป็นรูปจริง ≤ 5 MB)
→ ร้านเปิด /admin/slips เทียบยอด → ผ่าน: ทริป paid การจอง confirmed + LINE แจ้งลูกค้า + ตั้งเตือนก่อนวัน
                                 → ไม่ผ่าน: เลือกเหตุผล + LINE แจ้ง + เปิดให้แนบใหม่ (กันที่ต่อ)
ไม่แนบสลิปตามเวลา → ปล่อยที่อัตโนมัติ
```

| API | ใช้ทำอะไร |
|---|---|
| `POST /api/auth/line` | `{ idToken }` จาก LIFF → ตรวจกับ LINE → ตั้งคุกกี้ |
| `POST /api/me/consent` | บันทึกความยินยอม PDPA (+ เบอร์โทร ไม่บังคับ) |
| `POST /api/orders` | `{ items, accept: true }` สร้างทริปและกันที่ |
| `GET /api/orders/<ทริป>` | สถานะทริป (เฉพาะเจ้าของ) |
| `POST /api/orders/<ทริป>/slip` | แนบสลิป (multipart `slip`) |
| `POST /api/admin/payments/<รหัสสลิป>` | `{ action: approve \| reject, amount_slip, reason }` |
| `GET /api/cron/tick` | ปล่อยที่หมดเวลา + ส่ง LINE ที่ถึงเวลา (`Authorization: Bearer $CRON_SECRET`) |

ทดสอบ (ฐานข้อมูลที่เพิ่ง seed · `DEMO_MODE=1 DEMO_CUSTOMER=C002` · รันตามลำดับ):

```bash
./scripts/smoke_api.sh    # 14 ข้อ ที่ว่าง/ราคา
./scripts/e2e_orders.sh   # 16 ข้อ จอง → กดพร้อมกัน → สลิป → ไม่ผ่าน → แนบใหม่ → ผ่าน (เปลี่ยนข้อมูลในฐาน)
```

### ตั้งค่า LINE

1. LINE Login channel → สร้าง LIFF app · Endpoint URL = `https://<โดเมน>/` · Scope: `openid`, `profile` · ขนาด Full
2. ใส่ `NEXT_PUBLIC_LIFF_ID`, `LINE_LOGIN_CHANNEL_ID` ใน env
3. Messaging API channel ของ OA ร้าน → `LINE_CHANNEL_ACCESS_TOKEN` (ใช้ส่งแจ้งผลสลิปและเตือนก่อนวัน)
4. ปุ่มริชเมนูแต่ละธุรกิจลิงก์ไป `https://liff.line.me/<LIFF_ID>/b/<รหัสธุรกิจ>` · ปุ่ม "การจองของฉัน" → `/me`

### รอบตั้งเวลา

การปล่อยที่ทำทุกครั้งที่มีคนดูที่ว่าง/จอง/แนบสลิปอยู่แล้ว รอบตั้งเวลาจำเป็นสำหรับ **ส่ง LINE ซ้ำเมื่อส่งพลาด** และ **เตือนก่อนถึงวัน**
ให้เรียก `GET /api/cron/tick` พร้อม header `Authorization: Bearer $CRON_SECRET` ทุก 5–15 นาที
ทางเลือก: Vercel Cron (เช็กก่อนว่าแพ็กเกจที่ใช้ตั้งความถี่ได้แค่ไหน) · Supabase `pg_cron` + `pg_net` · บริการ cron ภายนอก

### ข้อควรรู้

- ข้อความยืนยันหลังร้านตรวจสลิปต้องใช้ **push** (ลูกค้าแนบสลิปใน LIFF ไม่มี reply token) · push ใช้โควตาข้อความของ OA ร่วมกันทั้ง 4 ธุรกิจ
- ส่ง LINE เฉพาะเมื่อพนักงานกดผ่าน/ไม่ผ่าน และเตือนก่อนวันของการจองที่ยืนยันแล้ว · ระบบไม่ส่งข้อความโฆษณาเอง
- อีเมลแจ้งร้าน (จองใหม่ / สลิปรอตรวจ) และปฏิทิน Google ถูกใส่คิวไว้แล้ว ตัวส่งจริงมาในขั้นที่ 3b


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

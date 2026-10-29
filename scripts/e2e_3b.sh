#!/usr/bin/env bash
# ทดสอบขั้นที่ 3b: ทริปหลายธุรกิจ · งานหน้าร้าน · แจ้ง Grooming เสร็จ · น้อง + วัคซีน · พนักงาน
# รันต่อจาก e2e_orders.sh ได้ (ฐานข้อมูลทดสอบ · DEMO_MODE=1 DEMO_CUSTOMER=C002 DEMO_STAFF=ST01)
# ./scripts/e2e_3b.sh [http://127.0.0.1:3000]
set -u
B="${1:-http://127.0.0.1:3000}"; H='content-type: application/json'; pass=0; fail=0
check() { if grep -q -- "$3" <<<"$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 → $2"; fail=$((fail+1)); fi; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\1\0\0\0\1\x08\x02\0\0\0\x90wS\xde\0\0\0\x0cIDATx\x9cc\xf8\xff\xff?\0\x05\xfe\x02\xfe\xa7\x35\x81\x84\0\0\0\0IEND\xaeB`\x82' > "$TMP/img.png"
post() { curl -s -XPOST "$B$1" -H "$H" -d "$2"; }

# ---- ทริปหลายธุรกิจ จ่าย QR เดียว ----
TRIP='[{"business":"pool","kind":"session","session":"S1500","date":"2026-11-22","pets":["P003","P004"]},
       {"business":"grooming","kind":"slot","service":"G-BATH","addons":["A-NAIL"],"staff":"ST03","start":"2026-11-22T16:00","pet":"P003"}]'
Q=$(post /api/quote "{\"items\":$TRIP}")
check 'ทริปคิดราคารวม (480 + 530)' "$Q" '"total":1010'
check 'มัดจำรวม (480 + 200)' "$Q" '"due_now":680'
R=$(post /api/orders "{\"items\":$TRIP,\"accept\":true}"); check 'สร้างทริป 2 ธุรกิจ' "$R" '"bookings":\["P-261122-[0-9]*","G-261122-[0-9]*"\]'
ORDER=$(grep -o '"order":"T-[0-9-]*"' <<<"$R" | cut -d'"' -f4)
GB=$(grep -o 'G-261122-[0-9]*' <<<"$R")
PAY=$(curl -s -XPOST $B/api/orders/$ORDER/slip -F "slip=@$TMP/img.png" | cut -d'"' -f4)
check 'สลิปเดียวทั้งทริป' "$PAY" 'PAY-'
post /api/admin/payments/$PAY '{"action":"approve","amount_slip":680}' >/dev/null
check 'ยืนยันทั้งทริป' "$(curl -s $B/api/orders/$ORDER)" '"status":"paid"'

# ---- งานหน้าร้าน ----
check 'เสร็จก่อนเริ่มไม่ได้' "$(post /api/admin/bookings/$GB '{"action":"finish"}')" 'bad_status'
check 'เริ่มทำ Grooming' "$(post /api/admin/bookings/$GB '{"action":"start"}')" '"ok":true'
check 'เสร็จ · แจ้งเจ้าของ' "$(post /api/admin/bookings/$GB '{"action":"finish"}')" '"ok":true'
check 'คำสั่งผิดชนิด' "$(post /api/admin/bookings/$GB '{"action":"check_in"}')" 'bad_status\|bad_action'
PB=$(grep -o 'P-261122-[0-9]*' <<<"$R")
check 'ยกเลิกรอบสระ' "$(post /api/admin/bookings/$PB '{"action":"cancel"}')" '"ok":true'
check 'ยกเลิกแล้วรอบว่างคืน' "$(curl -s "$B/api/availability?type=session&biz=pool&date=2026-11-22&kg=9")" '"code":"S1500".*"left":8'
check 'ยกเลิกซ้ำไม่ได้' "$(post /api/admin/bookings/$PB '{"action":"cancel"}')" 'bad_status'

# ---- น้อง + วัคซีน ----
NP=$(post /api/me/pets '{"name":"ทดสอบ","species":"dog","breed":"ผสม","weight_kg":4.5}'); check 'เพิ่มน้อง' "$NP" '"code":"P-'
PET=$(cut -d'"' -f4 <<<"$NP")
check 'น้ำหนักผิดเพิ่มไม่ได้' "$(post /api/me/pets '{"name":"x","weight_kg":0}')" 'bad_pet'
check 'ยังไม่มีวัคซีน จองสระไม่ได้' "$(post /api/quote "{\"items\":[{\"business\":\"pool\",\"kind\":\"session\",\"session\":\"S1000\",\"date\":\"2026-11-28\",\"pets\":[\"$PET\"]}]}")" 'vaccine_required'
check 'ส่งวัคซีน' "$(curl -s -XPOST $B/api/me/pets/$PET/vaccine -F vaccine='รวม 5 โรค' -F expires_on=2027-10-01 -F "file=@$TMP/img.png")" '"ok":true'
check 'ส่งวัคซีนให้น้องคนอื่นไม่ได้' "$(curl -s -XPOST $B/api/me/pets/P001/vaccine -F vaccine=x -F expires_on=2027-10-01 -F "file=@$TMP/img.png")" 'not_found'
check 'รอตรวจยังจองไม่ได้' "$(post /api/quote "{\"items\":[{\"business\":\"pool\",\"kind\":\"session\",\"session\":\"S1000\",\"date\":\"2026-11-28\",\"pets\":[\"$PET\"]}]}")" 'vaccine_required'
VID=$(curl -s $B/admin/vaccines | sed 's/<!-- -->//g' | grep -o '[0-9]* รายการ' | head -1)
check 'หลังบ้านเห็นวัคซีนรอตรวจ' "$VID" '^[1-9][0-9]* รายการ'
VAX=$(psql "${DB_URL:-postgresql://postgres@127.0.0.1:54329/t2}" -tAc "select id from pet_vaccines where pet_code='$PET'" 2>/dev/null)
if [ -n "$VAX" ]; then
  check 'ร้านกดวัคซีนผ่าน' "$(post /api/admin/vaccines/$VAX '{"action":"approve","expires_on":"2027-09-30"}')" '"ok":true'
  check 'ผ่านแล้วจองสระได้' "$(post /api/quote "{\"items\":[{\"business\":\"pool\",\"kind\":\"session\",\"session\":\"S1000\",\"date\":\"2026-11-28\",\"pets\":[\"$PET\"]}]}")" '"total":240'
else echo "SKIP ตรวจวัคซีน (ตั้ง DB_URL เพื่อหา id)"; fi

# ---- พนักงาน (เจ้าของ) ----
S=$(post /api/admin/staff '{"action":"add","display_name":"ทดสอบ","role":"staff","businesses":["pool"]}'); check 'เพิ่มพนักงาน' "$S" '"code":"ST-'
SC=$(grep -o 'ST-[0-9]*' <<<"$S")
check 'สร้างลิงก์เชิญ' "$(post /api/admin/staff "{\"action\":\"invite\",\"code\":\"$SC\"}")" '/staff/join?t=[0-9a-f]\{64\}'
check 'ลบพนักงาน' "$(post /api/admin/staff "{\"action\":\"remove\",\"code\":\"$SC\"}")" '"ok":true'
check 'ลบตัวเองไม่ได้' "$(post /api/admin/staff '{"action":"remove","code":"ST01"}')" 'ลบตัวเองไม่ได้'
check 'ลิงก์เชิญปลอมใช้ไม่ได้' "$(post /api/staff/join '{"idToken":"x","token":"abc"}')" 'ลิงก์เชิญไม่ถูกต้อง'
echo "ผ่าน $pass · ไม่ผ่าน $fail"; [ "$fail" = 0 ]

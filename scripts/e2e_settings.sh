#!/usr/bin/env bash
# ทดสอบตั้งค่าร้านจากหลังบ้าน (DEMO_STAFF=ST01 เจ้าของ) · ./scripts/e2e_settings.sh [http://127.0.0.1:3000]
set -u
B="${1:-http://127.0.0.1:3000}"; H='content-type: application/json'; pass=0; fail=0
check() { if grep -q -- "$3" <<<"$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 → $2"; fail=$((fail+1)); fi; }
set_() { curl -s -XPOST $B/api/admin/settings -H "$H" -d "$1"; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\1\0\0\0\1\x08\x02\0\0\0\x90wS\xde\0\0\0\x0cIDATx\x9cc\xf8\xff\xff?\0\x05\xfe\x02\xfe\xa7\x35\x81\x84\0\0\0\0IEND\xaeB`\x82' > "$TMP/a.png"

R=$(set_ '{"kind":"unit.save","business_code":"pet_hotel","name":"Family","summary":"20 ตร.ม. · รับ 4 ตัว","price":1450,"max_pets":4}')
check 'เพิ่มห้อง' "$R" '"code":"U-'
U=$(grep -o 'U-[0-9]*' <<<"$R")
check 'ห้องใหม่จองได้' "$(curl -s "$B/api/availability?type=stay&biz=pet_hotel&from=2026-11-21&to=2026-11-22&pets=3")" "\"code\":\"$U\",\"free\":true"
check 'ปิดห้อง' "$(set_ "{\"kind\":\"unit.active\",\"code\":\"$U\",\"active\":false}")" '"ok":true'
A=$(curl -s "$B/api/availability?type=stay&biz=pet_hotel&from=2026-11-21&to=2026-11-22&pets=1"); if grep -q "$U" <<<"$A"; then echo "FAIL ปิดห้องแล้วยังขึ้น"; fail=$((fail+1)); else echo "PASS ปิดห้องแล้วไม่ขึ้น"; pass=$((pass+1)); fi
check 'อัปโหลดรูปห้อง' "$(curl -s -XPOST $B/api/admin/photos -F owner=COZY1 -F "file=@$TMP/a.png")" '"ok":true'
check 'ราคาติดลบไม่ได้' "$(set_ '{"kind":"unit.save","code":"COZY1","name":"Cozy 1","price":-5}')" 'ไม่ถูกต้อง'
R=$(set_ '{"kind":"session.save","unit_code":"POOL1","start_time":"16:00","end_time":"17:00","weekdays":[6,7],"size_rule":"all","capacity":5,"price":260}')
check 'เพิ่มรอบสระ' "$R" '"code":"S-'
check 'รอบใหม่ขึ้นวันเสาร์' "$(curl -s "$B/api/availability?type=session&biz=pool&date=2026-11-28&kg=4")" '"start":"16:00"'
check 'เวลาจบก่อนเริ่มไม่ได้' "$(set_ '{"kind":"session.save","unit_code":"POOL1","start_time":"16:00","end_time":"15:00","weekdays":[6],"price":1}')" 'เวลาจบ'
check 'ลบรอบที่มีคนจองไม่ได้' "$(set_ '{"kind":"session.delete","code":"S1000"}')" 'ลบไม่ได้'
check 'แก้ราคา Grooming ตามขนาด' "$(set_ '{"kind":"service.save","code":"G-BATH","name":"อาบน้ำ + เป่า","kind2":"","price_mode":"by_weight","prices":[{"tier_code":"S","price":399,"duration_min":60}]}')" '"ok":true'
check 'คิดราคาหลังแก้ได้' "$(curl -s -XPOST $B/api/quote -H "$H" -d '{"items":[{"business":"grooming","kind":"slot","service":"G-BATH","addons":[],"staff":"ST03","start":"2026-11-28T13:00","pet":"P004"}]}')" '"total":5\|"total":399\|"amount"'
check 'ปิดทุกวันจันทร์' "$(set_ '{"kind":"hours.save","business_code":"pool","open_hours":"09:00-18:00","closed_weekdays":[1]}')" '"ok":true'
check 'วันจันทร์สระปิด' "$(curl -s "$B/api/availability?type=session&biz=pool&date=2026-11-23&kg=4")" 'ปิดวันนี้'
check 'เพิ่มวันปิดเฉพาะห้อง' "$(set_ '{"kind":"closure.add","business_code":"pet_hotel","unit_code":"GARDEN1","date_from":"2026-12-05","date_to":"2026-12-06","reason":"ซ่อมแอร์"}')" '"ok":true'
check 'ห้องปิดซ่อมไม่ว่าง' "$(curl -s "$B/api/availability?type=stay&biz=pet_hotel&from=2026-12-05&to=2026-12-06&pets=1")" 'ซ่อมแอร์'
check 'ตั้งมัดจำ 30%' "$(set_ '{"kind":"deposit.save","business_code":"pet_hotel","deposit_type":"percent","deposit_value":30,"cancel_rules":[{"days":7,"refund":100},{"days":3,"refund":50}],"hold_minutes":20}')" '"ok":true'
check 'มัดจำใหม่ใช้คิดเงิน (950 × 30%)' "$(curl -s -XPOST $B/api/quote -H "$H" -d '{"items":[{"business":"pet_hotel","kind":"stay","unit":"GARDEN1","from":"2026-12-10","to":"2026-12-11","pets":["P003"]}]}')" '"due_now":285'
check 'มัดจำเกิน 100% ไม่ได้' "$(set_ '{"kind":"deposit.save","business_code":"pet_hotel","deposit_type":"percent","deposit_value":150}')" '1–100'
check 'ปิดข้อความเตือน' "$(set_ '{"kind":"settings.save","values":{"msg_reminder":"off"}}')" '"ok":true'
check 'เลขพร้อมเพย์ผิดไม่รับ' "$(set_ '{"kind":"settings.save","values":{"promptpay_id":"123"}}')" 'พร้อมเพย์'
check 'คำสั่งแปลกไม่รับ' "$(set_ '{"kind":"drop.table"}')" 'bad_kind'
echo "ผ่าน $pass · ไม่ผ่าน $fail"; [ "$fail" = 0 ]

#!/usr/bin/env bash
# ทดสอบ API กับข้อมูลใน seed (ต้องเปิด DEMO_MODE=1 DEMO_CUSTOMER=C002 และรัน npm run dev/start ก่อน)
# ./scripts/smoke_api.sh [http://127.0.0.1:3000]
set -u
B="${1:-http://127.0.0.1:3000}"; pass=0; fail=0
check() { # ชื่อ, ผลที่ได้, ข้อความที่ต้องมี
  if grep -q -- "$3" <<<"$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 → $2"; fail=$((fail+1)); fi; }
get() { curl -s "$B/api/availability?$1"; }
post() { curl -s -XPOST "$B/api/quote" -H 'content-type: application/json' -d "$1"; }

check 'Cozy 1 ไม่ว่าง 21 พ.ย.' "$(get 'type=stay&biz=pet_hotel&from=2026-11-21&to=2026-11-22&pets=1')" '"code":"COZY1","free":false'
check 'Cozy 2 ว่าง 21 พ.ย.' "$(get 'type=stay&biz=pet_hotel&from=2026-11-21&to=2026-11-22&pets=1')" '"code":"COZY2","free":true'
check 'Villa ทั้งสองหลังเต็ม 21–23' "$(get 'type=stay&biz=villa&from=2026-11-21&to=2026-11-23&guests=2')" '"code":"LOFT","free":false'
check 'LOFT ปิดซ่อม 1 ธ.ค.' "$(get 'type=stay&biz=villa&from=2026-12-01&to=2026-12-02&guests=2')" 'ซ่อมบำรุง'
check 'รอบ 10:00 เหลือ 8' "$(get 'type=session&biz=pool&date=2026-11-21&kg=9')" '"code":"S1000".*"left":8'
check 'น้อง 9 กก. เข้ารอบใหญ่ไม่ได้' "$(get 'type=session&biz=pool&date=2026-11-21&kg=9')" 'ขนาดน้องไม่ตรงรอบ'
check 'สระปิด 25 พ.ย.' "$(get 'type=session&biz=pool&date=2026-11-25&kg=9')" 'ปิดวันนี้'
check 'ช่างมะปรางไม่ว่าง 14:00' "$(get 'type=slot&biz=grooming&date=2026-11-21&service=G-BATH&tier=M')" '"start":"14:00","staff":"ST03"'
check 'ราคาสระ 2 ตัว 480' "$(post '{"items":[{"business":"pool","kind":"session","session":"S1000","date":"2026-11-21","pets":["P003","P004"]}]}')" '"total":480'
check 'Villa + น้อง มัดจำ 50%' "$(post '{"items":[{"business":"villa","kind":"stay","unit":"TEAK","from":"2026-11-27","to":"2026-11-29","pets":["P003"],"guests":6}]}')" '"total":9600,"due_now":4800'
check 'Grooming มัดจำ 200' "$(post '{"items":[{"business":"grooming","kind":"slot","service":"G-BATH","addons":["A-NAIL"],"staff":"ST03","start":"2026-11-21T14:00","pet":"P003"}]}')" '"total":530,"due_now":200'
check 'จองน้องของคนอื่นไม่ได้' "$(post '{"items":[{"business":"pet_hotel","kind":"stay","unit":"COZY2","from":"2026-11-21","to":"2026-11-22","pets":["P001"]}]}')" 'pet_not_owner'
check 'ห้องไม่ว่างคิดราคาไม่ได้' "$(post '{"items":[{"business":"pet_hotel","kind":"stay","unit":"COZY1","from":"2026-11-21","to":"2026-11-22","pets":["P003"]}]}')" 'unit_taken'
check 'คิวช่างทับคิดราคาไม่ได้' "$(post '{"items":[{"business":"grooming","kind":"slot","service":"G-BATH","addons":[],"staff":"ST02","start":"2026-11-21T14:00","pet":"P003"}]}')" 'slot_taken'
echo "ผ่าน $pass · ไม่ผ่าน $fail"; [ "$fail" = 0 ]

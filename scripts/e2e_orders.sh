#!/usr/bin/env bash
# ทดสอบการจองจริงตั้งแต่จองจนร้านยืนยัน (ใช้กับฐานข้อมูลทดสอบที่เพิ่ง seed · โหมดเดโม่ DEMO_CUSTOMER=C002)
# ./scripts/e2e_orders.sh [http://127.0.0.1:3000]
set -u
B="${1:-http://127.0.0.1:3000}"; H='content-type: application/json'; pass=0; fail=0
check() { if grep -q -- "$3" <<<"$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 → $2"; fail=$((fail+1)); fi; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
# รูป PNG เล็ก ๆ ใช้แทนสลิป
printf '\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\1\0\0\0\1\x08\x02\0\0\0\x90wS\xde\0\0\0\x0cIDATx\x9cc\xf8\xff\xff?\0\x05\xfe\x02\xfe\xa7\x35\x81\x84\0\0\0\0IEND\xaeB`\x82' > "$TMP/slip.png"
echo nope > "$TMP/fake.png"
ITEM='{"business":"pet_hotel","kind":"stay","unit":"COZY2","from":"2026-11-21","to":"2026-11-22","pets":["P003"]}'

check 'ต้องติ๊กยอมรับเงื่อนไข' "$(curl -s -XPOST $B/api/orders -H "$H" -d "{\"items\":[$ITEM]}")" '"error":"policy"'
R1=$(curl -s -XPOST $B/api/orders -H "$H" -d "{\"items\":[$ITEM],\"accept\":true}" & curl -s -XPOST $B/api/orders -H "$H" -d "{\"items\":[$ITEM],\"accept\":true}"; wait)
check 'กดจองพร้อมกัน 2 ครั้ง ได้ 1' "$R1" '"order":"T-'
check 'อีกครั้งถูกกัน' "$R1" 'just_taken\|unit_taken'
ORDER=$(grep -o '"order":"T-[0-9-]*"' <<<"$R1" | head -1 | cut -d'"' -f4)
check 'สร้างทริปแล้ว' "$ORDER" 'T-'
check 'ห้องถูกกันไว้' "$(curl -s "$B/api/availability?type=stay&biz=pet_hotel&from=2026-11-21&to=2026-11-22&pets=1")" '"code":"COZY2","free":false'
check 'ไฟล์ไม่ใช่รูปแนบไม่ได้' "$(curl -s -XPOST $B/api/orders/$ORDER/slip -F "slip=@$TMP/fake.png")" 'not_image'
check 'ทริปคนอื่นแนบไม่ได้' "$(curl -s -XPOST $B/api/orders/T-261115-01/slip -F "slip=@$TMP/slip.png")" 'not_found\|bad_status'
P1=$(curl -s -XPOST $B/api/orders/$ORDER/slip -F "slip=@$TMP/slip.png"); check 'แนบสลิป' "$P1" '"payment":"PAY-'
check 'แนบซ้ำไม่ได้' "$(curl -s -XPOST $B/api/orders/$ORDER/slip -F "slip=@$TMP/slip.png")" 'bad_status'
PAY1=$(cut -d'"' -f4 <<<"$P1")
check 'ร้านกดไม่ผ่าน' "$(curl -s -XPOST $B/api/admin/payments/$PAY1 -H "$H" -d '{"action":"reject","amount_slip":500,"reason":"ยอดไม่ครบ · ขอส่วนที่ขาด"}')" '"ok":true'
check 'ลูกค้าเห็นเหตุผล' "$(curl -s $B/api/orders/$ORDER)" 'ยอดไม่ครบ'
P2=$(curl -s -XPOST $B/api/orders/$ORDER/slip -F "slip=@$TMP/slip.png"); check 'แนบใหม่ได้' "$P2" '"payment":"PAY-'
PAY2=$(cut -d'"' -f4 <<<"$P2")
check 'ร้านกดผ่าน' "$(curl -s -XPOST $B/api/admin/payments/$PAY2 -H "$H" -d '{"action":"approve","amount_slip":650}')" '"ok":true'
check 'ตรวจซ้ำไม่ได้' "$(curl -s -XPOST $B/api/admin/payments/$PAY2 -H "$H" -d '{"action":"approve"}')" '"error":"done"'
check 'ทริปยืนยันแล้ว' "$(curl -s $B/api/orders/$ORDER)" '"status":"paid"'
check 'การจองยืนยันแล้ว' "$(curl -s $B/api/orders/$ORDER)" '"status":"confirmed"'
echo "ผ่าน $pass · ไม่ผ่าน $fail"; [ "$fail" = 0 ]

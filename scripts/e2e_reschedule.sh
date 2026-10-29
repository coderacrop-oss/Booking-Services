#!/usr/bin/env bash
# ทดสอบเลื่อนวัน (ฐานข้อมูลที่เพิ่ง seed · DEMO_STAFF=ST01) · ./scripts/e2e_reschedule.sh [http://127.0.0.1:3000]
set -u
B="${1:-http://127.0.0.1:3000}"; H='content-type: application/json'; pass=0; fail=0
check() { if grep -q -- "$3" <<<"$2"; then echo "PASS $1"; pass=$((pass+1)); else echo "FAIL $1 → $2"; fail=$((fail+1)); fi; }
mv_() { curl -s -XPOST $B/api/admin/bookings/$1 -H "$H" -d "$2"; }
# ที่พัก: Cozy 1 (H-261121-01) 21→22 เลื่อนเป็น 24 พ.ย. 2 คืน
check 'เลื่อน Pet hotel' "$(mv_ H-261121-01 '{"action":"reschedule","date":"2026-11-24","nights":2}')" '"ok":true'
check 'วันเดิมว่างแล้ว' "$(curl -s "$B/api/availability?type=stay&biz=pet_hotel&from=2026-11-21&to=2026-11-22&pets=1")" '"code":"COZY1","free":true'
check 'วันใหม่ไม่ว่าง' "$(curl -s "$B/api/availability?type=stay&biz=pet_hotel&from=2026-11-25&to=2026-11-26&pets=1")" '"code":"COZY1","free":false'
curl -s -XPOST $B/api/orders -H "$H" -d '{"items":[{"business":"pet_hotel","kind":"stay","unit":"COZY1","from":"2026-11-28","to":"2026-11-29","pets":["P003"]}],"accept":true}' >/dev/null
check 'เลื่อนทับห้องที่มีคนจองไม่ได้' "$(mv_ H-261121-01 '{"action":"reschedule","date":"2026-11-28","nights":1}')" 'เพิ่งมีคนจอง'
check 'ห้องอื่นวันเดียวกันได้' "$(mv_ H-261121-02 '{"action":"reschedule","date":"2026-11-24","nights":1}')" '"ok":true'
check 'เลื่อน Villa ทับวันปิดซ่อมไม่ได้' "$(mv_ V-261121-01 '{"action":"reschedule","date":"2026-12-01","nights":1}')" 'ปิด'
# สระ: P-261121-01 S1000 → 22 พ.ย. รอบ 15:00 (S1500 เปิดเสาร์–อาทิตย์)
check 'เลื่อนรอบสระ' "$(mv_ P-261121-01 '{"action":"reschedule","date":"2026-11-22","session":"S1500"}')" '"ok":true'
check 'รอบใหม่ที่ลดลง' "$(curl -s "$B/api/availability?type=session&biz=pool&date=2026-11-22&kg=4")" '"code":"S1500".*"left":6'
check 'รอบที่วันไม่เปิดไม่ได้' "$(mv_ P-261121-01 '{"action":"reschedule","date":"2026-11-24","session":"S1500"}')" 'ไม่เปิดวันที่เลือก'
check 'วันปิดสระไม่ได้' "$(mv_ P-261121-01 '{"action":"reschedule","date":"2026-11-25","session":"S1000"}')" 'ปิด'
# Grooming: G-261121-01 (ST02 14:00–16:00) → 22 พ.ย. 11:00 ช่าง ST03
check 'เลื่อน Grooming' "$(mv_ G-261121-01 '{"action":"reschedule","date":"2026-11-22","time":"11:00","staff":"ST03"}')" '"ok":true'
check 'ช่างวันหยุดไม่ได้ (พี่ต้นหอมหยุดพฤหัส)' "$(mv_ G-261121-01 '{"action":"reschedule","date":"2026-11-26","time":"11:00","staff":"ST03"}')" 'ช่างไม่ได้ทำงาน'
check 'ร้านปิดวันจันทร์' "$(mv_ G-261121-01 '{"action":"reschedule","date":"2026-11-23","time":"11:00","staff":"ST02"}')" 'ปิด'
check 'วันที่ผ่านแล้วไม่ได้' "$(mv_ G-261121-01 '{"action":"reschedule","date":"2020-01-01","time":"11:00"}')" 'ยังไม่ผ่าน'
echo "ผ่าน $pass · ไม่ผ่าน $fail"; [ "$fail" = 0 ]

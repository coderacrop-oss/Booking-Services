#!/usr/bin/env bash
# ทดสอบบน Postgres เปล่า (ไม่ใช่ Supabase): ./scripts/test_db.sh "postgresql://user@host:port/postgres"
set -euo pipefail
URL="${1:?ใส่ connection string ของ Postgres เปล่า}"
DB=booking_test_$$
psql "$URL" -qc "create database $DB"
T="${URL%/*}/$DB"
psql "$T" -q -v ON_ERROR_STOP=1 -f tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do psql "$T" -q -v ON_ERROR_STOP=1 -f "$f"; done
python3 scripts/excel_to_seed.py data/BaanMax-booking-schema.xlsx | psql "$T" -q -v ON_ERROR_STOP=1
psql "$T" -f tests/db_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  //'
psql "$URL" -qc "drop database $DB"

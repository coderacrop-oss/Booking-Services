#!/usr/bin/env node
// รัน migration ที่ยังไม่เคยรัน (รันซ้ำได้ ปลอดภัย) + ใส่ข้อมูลทดลองครั้งแรกถ้าตั้ง SEED_DEMO=1
//   npm run db:migrate                  ← รันเองจากเครื่อง (อ่าน .env.local)
//   ตอน deploy บน Vercel รันให้เองก่อน build (ดู "build" ใน package.json)
// ใช้ SUPABASE_DB_URL (หรือ MIGRATE_DB_URL ถ้าอยากใช้ connection อื่นตอน migrate)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const onlyVercel = process.argv.includes('--if-vercel');

// อ่าน .env.local ตอนรันเอง (บน Vercel env มีอยู่แล้ว)
for (const f of ['.env.local', '.env']) {
  const p = path.join(root, f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

if (onlyVercel && process.env.VERCEL !== '1' && process.env.MIGRATE !== '1') {
  console.log('migrate: ข้าม (ไม่ได้อยู่บน Vercel)');
  process.exit(0);
}
const url = process.env.MIGRATE_DB_URL || process.env.SUPABASE_DB_URL;
if (!url) {
  if (onlyVercel) { console.log('migrate: ข้าม (ยังไม่ได้ตั้ง SUPABASE_DB_URL)'); process.exit(0); }
  console.error('ตั้ง SUPABASE_DB_URL ใน .env.local ก่อน'); process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {}, connect_timeout: 20 });
try {
  await sql`create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const done = new Set((await sql`select name from public.schema_migrations`).map((r) => r.name));
  const dir = path.join(root, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  // เคยวาง setup_all.sql เองใน SQL Editor มาก่อน → บันทึกว่ารันแล้ว ไม่รันซ้ำ
  if (!done.size) {
    const [{ exists }] = await sql`select to_regclass('public.businesses') is not null as exists`;
    if (exists) {
      // ดูว่าตั้งไว้ถึงไฟล์ไหน จากร่องรอยของแต่ละไฟล์
      const [m] = await sql`select
          exists (select 1 from information_schema.columns where table_name = 'businesses' and column_name = 'cancel_rules') as m800,
          exists (select 1 from settings where key = 'msg_rescheduled') as m900`;
      const upto = m.m900 ? '20261029000900' : m.m800 ? '20261029000800' : '20261029000700';
      const base = files.filter((f) => f.slice(0, 14) <= upto);
      for (const f of base) { await sql`insert into public.schema_migrations (name) values (${f}) on conflict do nothing`; done.add(f); }
      console.log(`migrate: พบฐานข้อมูลที่ตั้งไว้แล้ว · บันทึก ${base.length} ไฟล์ว่ารันแล้ว`);
    }
  }

  let n = 0;
  for (const f of files) {
    if (done.has(f)) continue;
    const body = readFileSync(path.join(dir, f), 'utf8');
    process.stdout.write(`migrate: ${f} … `);
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into public.schema_migrations (name) values (${f})`;
    });
    console.log('ok'); n++;
  }
  console.log(n ? `migrate: รันเพิ่ม ${n} ไฟล์` : 'migrate: ฐานข้อมูลเป็นปัจจุบันแล้ว');

  // ข้อมูลทดลอง: ใส่ครั้งเดียวเมื่อยังไม่มีธุรกิจในระบบ
  if (process.env.SEED_DEMO === '1') {
    const [{ c }] = await sql`select count(*)::int as c from businesses`;
    if (c === 0) {
      const seed = readFileSync(path.join(root, 'supabase', 'seed.sql'), 'utf8').split('\n')
        .filter((l) => l.trim() !== 'begin;' && l.trim() !== 'commit;').join('\n');
      await sql.begin((tx) => tx.unsafe(seed));
      console.log('migrate: ใส่ข้อมูลร้านและข้อมูลทดลองแล้ว');
    } else console.log('migrate: มีข้อมูลร้านอยู่แล้ว ไม่ใส่ข้อมูลทดลองซ้ำ');
  }
} catch (e) {
  console.error('\nmigrate ล้มเหลว:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}

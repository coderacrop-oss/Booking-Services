import 'server-only';
import { NextResponse } from 'next/server';
import { BookingError } from './booking';

// รูปแบบตอบกลับ error เดียวกันทุก API
export function fail(e: unknown) {
  if (e instanceof BookingError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
  console.error(e);
  return NextResponse.json({ error: 'server_error', message: 'ระบบขัดข้อง ลองใหม่อีกครั้ง' }, { status: 500 });
}
export const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const CODE = /^[A-Za-z0-9_-]{1,40}$/;

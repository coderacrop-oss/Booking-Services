import 'server-only';
import { sql } from './db';
import { currentCustomer } from './session';

// สถานะลูกค้าปัจจุบัน: ล็อกอินไหม · ยอมรับ PDPA แล้วไหม
export async function me() {
  const code = await currentCustomer();
  if (!code) return { code: null, consented: false };
  const [c] = await sql`select pdpa_at is not null as consented from customers where code = ${code}`;
  if (!c) return { code: null, consented: false };
  return { code, consented: c.consented as boolean };
}

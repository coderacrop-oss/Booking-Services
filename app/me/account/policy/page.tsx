import { sql } from '@/lib/db';
import { bizLook } from '@/lib/look';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';

export const dynamic = 'force-dynamic';
const DEP = (t: string, v: number | null) => (t === 'full' ? 'จ่ายเต็มตอนจอง' : t === 'percent' ? `มัดจำ ${v}%` : `มัดจำ ฿${v}`);
export default async function Policy() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [biz, hold] = await Promise.all([
    sql`select code, name, color, booking_type, deposit_type, deposit_value, cancel_policy from businesses where active order by sort`,
    sql`select value from settings where key = 'hold_minutes'`,
  ]);
  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>นโยบายมัดจำและยกเลิก</b></div>
      <div className="note y">กดจองแล้วร้านกันที่ไว้ {hold[0]?.value ?? 30} นาที แนบสลิปไม่ทันระบบจะปล่อยที่ให้คนอื่น</div>
      {biz.map((b) => { const L = bizLook(b.code, b.color, b.booking_type); return (
        <div key={b.code} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow }}>{b.name}</span>
          <b style={{ fontSize: 15 }}>{DEP(b.deposit_type, b.deposit_value)}</b>
          <span className="cap">{b.cancel_policy}</span>
        </div>); })}
    </CustScreen>
  );
}

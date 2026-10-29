import Link from 'next/link';
import { me } from '@/lib/me';
import { myOrders } from '@/lib/orders';
import { baht, thDate } from '@/lib/thaidate';
import LiffGate from '@/components/LiffGate';

export const dynamic = 'force-dynamic';

const ST: Record<string, [string, string, string]> = {
  holding: ['รอโอน', '#FDF5DC', '#8A5A00'], pending_review: ['รอร้านตรวจสลิป', '#FDF5DC', '#8A5A00'],
  paid: ['ยืนยันแล้ว', '#E4F3EA', '#1E7B4A'], cancelled: ['ยกเลิก', '#FBE3E4', '#B8262E'], expired: ['หมดเวลา', '#F4F4F1', '#9A9A96'],
};

// การจองของฉัน (ริชเมนูทุกอันมีปุ่มนี้)
export default async function MyBookings() {
  const m = await me();
  if (!m.code) return <LiffGate loggedIn={false}><main className="app"><div className="body"><div className="warn">เปิดหน้านี้ผ่าน LINE ของร้าน</div></div></main></LiffGate>;
  const orders = await myOrders(m.code);
  return (
    <main className="app">
      <div className="topbar"><b>การจองของฉัน</b></div>
      <div className="body">
        {!orders.length && <div className="sub">ยังไม่มีการจอง · <Link href="/" style={{ textDecoration: 'underline' }}>จองบริการ</Link></div>}
        {orders.map((o) => {
          const s = ST[o.status] ?? [o.status, '#eee', '#111'];
          return (
            <Link key={o.code} href={`/pay/${o.code}`} className="card" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b className="num">{o.code}</b>
                <span className="pill" style={{ background: s[1], color: s[2] }}>{s[0]}</span>
              </div>
              {o.items.map((i) => (
                <small key={i.code} className="sub">{i.biz} · {i.item}{i.pets ? ` · ${i.pets}` : ''} · {thDate(i.s.slice(0, 10))} {i.s.slice(11)}</small>
              ))}
              <small className="num" style={{ fontWeight: 700 }}>รวม {baht(o.total)}{o.status === 'holding' ? ` · ต้องโอน ${baht(o.due_now)}` : ''}</small>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

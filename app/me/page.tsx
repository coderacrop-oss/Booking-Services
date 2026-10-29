import Link from 'next/link';
import { myOrders } from '@/lib/orders';
import { baht, thDate } from '@/lib/thaidate';
import { ORDER_ST, Pill } from '@/lib/status';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import Empty from '@/components/Empty';

export const dynamic = 'force-dynamic';

// การจองของฉัน
export default async function MyBookings() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const orders = await myOrders(g.code);
  return (
    <CustScreen>
      <div className="title">การจองของฉัน</div>
      {!orders.length && <Empty icon="receipt_long" title="ยังไม่มีการจอง" text="จองที่พัก สระ หรือ Grooming ให้น้องได้เลย การจองทั้งหมดจะอยู่ที่นี่" action={{ label: 'จองบริการ', href: '/' }} />}
      {orders.map((o) => (
        <Link key={o.code} href={`/me/b/${o.code}`} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <span className="cap num">{o.code}</span><Pill s={ORDER_ST[o.status] ?? [o.status, '#eee', '#111']} />
          </div>
          {o.items.map((i) => (
            <span key={i.code} className="t">
              <b style={{ fontSize: 16 }}>{i.item}{i.pets ? ` · ${i.pets}` : ''}</b>
              <small>{i.biz} · {thDate(i.s.slice(0, 10))} {i.s.slice(11)}</small>
            </span>
          ))}
          <small className="num" style={{ fontWeight: 700 }}>รวม {baht(o.total)}{o.status === 'holding' ? ` · ต้องโอน ${baht(o.due_now - Number(o.paid_amount))}` : ''}{o.status === 'paid' && Number(o.balance_due) > 0 ? ` · ค้างชำระ ${baht(Number(o.balance_due))}` : ''}</small>
        </Link>
      ))}
    </CustScreen>
  );
}

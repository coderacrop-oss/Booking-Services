import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOrder } from '@/lib/orders';
import { baht, thDate, thRange } from '@/lib/thaidate';
import { BOOK_ST, Pill } from '@/lib/status';
import { bizLook } from '@/lib/look';
import { sql } from '@/lib/db';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';

export const dynamic = 'force-dynamic';

const STEPS = ['จองแล้ว', 'ตรวจสลิป', 'ยืนยัน', 'ใช้บริการ'];

// รายละเอียดการจองฝั่งลูกค้า
export default async function OrderDetail({ params }: { params: Promise<{ code: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const o = await getOrder(g.code, (await params).code);
  if (!o) notFound();
  const biz = await sql`select code, color, booking_type from businesses`;
  const look = (c: string) => { const b = biz.find((x) => x.code === c); return bizLook(c, b?.color ?? null, b?.booking_type ?? ''); };
  const used = o.items.some((i) => ['checked_in', 'in_progress', 'done'].includes(i.status));
  const at = o.status === 'holding' ? 0 : o.status === 'pending_review' ? 1 : o.status === 'paid' ? (used ? 3 : 2) : -1;
  const first = o.items[0];
  const title = o.items.length === 1 && first
    ? (first.s.slice(0, 10) !== first.e.slice(0, 10) ? `${first.item} ${thRange(first.s.slice(0, 10), first.e.slice(0, 10))}` : `${first.item} · ${thDate(first.s.slice(0, 10))}`)
    : `ทริป ${o.items.length} รายการ`;
  return (
    <CustScreen>
      <Link href="/me" className="back"><span className="ms">arrow_back</span></Link>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span className="cap num">{o.code}</span>
        <b style={{ fontSize: 22, fontWeight: 800 }}>{title}</b>
        {o.items.some((i) => i.pets) && <span className="cap">{[...new Set(o.items.map((i) => i.pets).filter(Boolean))].join(' · ')}</span>}
      </div>
      {at >= 0 ? (
        <>
          <div className="steps4">{STEPS.map((s, k) => <i key={s} className={k <= at ? 'on' : ''} />)}</div>
          <div className="steps4l">{STEPS.map((s, k) => <span key={s} style={k === at ? { color: 'var(--ink)', fontWeight: 800 } : undefined}>{s}</span>)}</div>
        </>
      ) : <div className="err">{o.status === 'expired' ? 'หมดเวลากันที่ การจองนี้ไม่ได้ใช้แล้ว' : 'การจองนี้ถูกยกเลิก'}</div>}
      {o.last_payment?.status === 'rejected' && o.status === 'holding' && <div className="err">สลิปไม่ผ่าน: {o.last_payment.reason} · แนบใหม่ได้</div>}

      <div className="grp">รายการในการจองนี้</div>
      {o.items.map((i) => {
        const L = look(i.business_code);
        return (
          <div key={i.code} className="row" style={{ borderBottom: 0, padding: '4px 0' }}>
            <span className="biztag" style={{ background: L.bg, color: L.fg, boxShadow: L.shadow, alignSelf: 'center' }}>{i.biz}</span>
            <span className="t"><b style={{ fontSize: 15 }}>{i.item}{i.pets ? ` · ${i.pets}` : ''}</b>
              <small>{thDate(i.s.slice(0, 10))} {i.s.slice(11)}{i.s.slice(0, 10) !== i.e.slice(0, 10) ? ` – ${thDate(i.e.slice(0, 10))} ${i.e.slice(11)}` : ''}</small></span>
            <Pill s={BOOK_ST[i.status] ?? [i.status, '#eee', '#111']} />
          </div>
        );
      })}
      <div className="bill">
        <div className="l"><span>รวม</span><span className="num">{baht(o.total)}</span></div>
        <div className="l"><span>จ่ายแล้ว</span><span className="num">{baht(o.status === 'paid' ? o.due_now : 0)}</span></div>
        {o.total > o.due_now && <div className="l"><span>จ่ายที่ร้าน</span><span className="num">{baht(o.total - o.due_now)}</span></div>}
      </div>
      {o.status === 'holding' && <Link href={`/pay/${o.code}`} className="btnw dark">จ่ายมัดจำ {baht(o.due_now)} · แนบสลิป</Link>}
    </CustScreen>
  );
}

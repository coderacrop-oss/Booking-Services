import { sql } from '@/lib/db';
import { canSee, currentStaff } from '@/lib/staff';
import { addDays, baht, thDate, todayTH } from '@/lib/thaidate';
import { bizLook } from '@/lib/look';
import BookingActions from '@/components/BookingActions';

export const dynamic = 'force-dynamic';

const ST: Record<string, [string, string, string]> = {
  holding: ['รอโอน', '#FDF5DC', '#8A5A00'], confirmed: ['ยืนยันแล้ว', '#E4F3EA', '#1E7B4A'],
  checked_in: ['เข้าพักแล้ว', '#E4F3EA', '#1E7B4A'], in_progress: ['กำลังทำ', '#E3EEFB', '#1F5FA8'],
  done: ['เสร็จแล้ว', '#F4F4F1', '#555'], cancelled: ['ยกเลิก', '#FBE3E4', '#B8262E'],
  no_show: ['ไม่มา', '#FBE3E4', '#B8262E'], expired: ['หมดเวลา', '#F4F4F1', '#9A9A96'],
};

// หลังบ้าน · วันนี้ (อ่านอย่างเดียวในเวอร์ชันนี้)
export default async function AdminToday({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const staff = await currentStaff();
  if (!staff) return null;
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date || '') ? sp.date! : todayTH();

  const [rows, slips, vax, biz] = await Promise.all([
    sql`select k.code, k.business_code, k.kind, k.status, k.price, k.guests,
               to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as s,
               to_char(k.end_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as e,
               coalesce(u.name, '') as unit, coalesce(sv.name, '') as service, coalesce(st.display_name, '') as staff,
               c.display_name as customer, o.status as order_status,
               coalesce((select string_agg(p.name, ', ') from booking_pets bp join pets p on p.code = bp.pet_code where bp.booking_code = k.code), '') as pets
        from bookings k join orders o on o.code = k.order_code join customers c on c.code = o.customer_code
        left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code left join staff st on st.code = k.staff_code
        where k.status not in ('cancelled', 'expired')
          and (k.start_at at time zone 'Asia/Bangkok')::date <= ${date}::date
          and (k.end_at at time zone 'Asia/Bangkok')::date >= ${date}::date
        order by k.business_code, k.start_at`,
    sql`select count(*)::int as n from payments where status = 'pending'`,
    sql`select count(*)::int as n from pet_vaccines where status = 'pending'`,
    sql`select code, name, color, booking_type from businesses where active order by sort`,
  ]);

  return (
    <main className="admin">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div className="h1" style={{ flex: 1 }}>{date === todayTH() ? 'วันนี้' : 'การจอง'} · {thDate(date)}</div>
        <a className="btn ghost" href={`?date=${addDays(date, -1)}`}>‹</a>
        <a className="btn ghost" href="?">วันนี้</a>
        <a className="btn ghost" href={`?date=${addDays(date, 1)}`}>›</a>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <a href="/admin/slips" className="pill" style={{ background: '#FDF5DC', color: '#8A5A00' }}>สลิปรอตรวจ {slips[0].n} ›</a>
        <span className="pill" style={{ background: '#FDF5DC', color: '#8A5A00' }}>วัคซีนรอตรวจ {vax[0].n}</span>
      </div>
      {biz.filter((b) => canSee(staff, b.code)).map((b) => {
        const list = rows.filter((r) => r.business_code === b.code);
        const L = bizLook(b.code, b.color, b.booking_type);
        return (
          <section key={b.code} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="tag" style={{ background: L.bg, color: L.fg }}><span className="ms" style={{ fontSize: 16 }}>{L.icon}</span>{b.name}</span>
              <span className="sub">{list.length} รายการ</span>
            </div>
            {list.length > 0 && (
              <table>
                <thead><tr><th>รหัส</th><th>เวลา</th><th>รายการ</th><th>ลูกค้า · น้อง</th><th>ราคา</th><th>สถานะ</th><th></th></tr></thead>
                <tbody>
                  {list.map((r) => {
                    const s = ST[r.status] ?? [r.status, '#eee', '#111'];
                    const span = r.s.slice(0, 10) === r.e.slice(0, 10) ? `${r.s.slice(11)}–${r.e.slice(11)}` : `${thDate(r.s.slice(0, 10), false)} ${r.s.slice(11)} → ${thDate(r.e.slice(0, 10), false)} ${r.e.slice(11)}`;
                    return (
                      <tr key={r.code}>
                        <td className="num">{r.code}</td><td className="num">{span}</td>
                        <td>{[r.unit, r.service, r.staff && 'พี่' + r.staff, r.guests && `${r.guests} คน`].filter(Boolean).join(' · ')}</td>
                        <td>{r.customer}{r.pets ? ' · ' + r.pets : ''}</td>
                        <td className="num">{baht(r.price)}</td>
                        <td><span className="pill" style={{ background: s[1], color: s[2] }}>{s[0]}</span>{r.order_status === 'pending_review' && <span className="pill" style={{ background: '#FDF5DC', color: '#8A5A00', marginLeft: 4 }}>สลิปรอตรวจ</span>}</td>
                        <td><BookingActions code={r.code} kind={r.kind} status={r.status} paid={r.order_status === 'paid'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </main>
  );
}

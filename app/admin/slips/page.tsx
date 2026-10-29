import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import { signedUrl } from '@/lib/storage';
import SlipReview from '@/components/SlipReview';

export const dynamic = 'force-dynamic';

// สลิปรอตรวจ: ดูรูปเทียบยอดที่ควรได้ แล้วกดผ่าน/ไม่ผ่าน
export default async function Slips() {
  const s = await currentStaff();
  if (!s) return null;
  const rows = await sql`
    select p.code, p.order_code, p.amount_due, p.slip_file, to_char(p.created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as at,
           c.display_name as customer, c.phone,
           (select json_agg(json_build_object('code', k.code, 'biz', b.name, 'item', coalesce(u.name, sv.name, ''),
                    's', to_char(k.start_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI'), 'price', k.price) order by k.start_at)
              from bookings k join businesses b on b.code = k.business_code
              left join units u on u.code = k.unit_code left join services sv on sv.code = k.service_code
              where k.order_code = p.order_code
                and (${s.role} = 'owner' or 'all' = any (${s.businesses}::text[]) or k.business_code = any (${s.businesses}::text[]))) as items
    from payments p join orders o on o.code = p.order_code join customers c on c.code = o.customer_code
    where p.status = 'pending' order by p.created_at`;
  const list = await Promise.all(rows.filter((r) => r.items).map(async (r) => ({ ...r, url: await signedUrl('slips', r.slip_file) })));
  return (
    <main className="admin">
      <div className="h1">สลิปรอตรวจ · {list.length}</div>
      {!list.length && <div className="sub">ไม่มีสลิปรอตรวจ</div>}
      {list.map((r) => <SlipReview key={(r as unknown as { code: string }).code} p={r as unknown as never} />)}
    </main>
  );
}

import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import { canReviewVaccine } from '@/lib/pets';
import { signedUrl } from '@/lib/storage';
import VaccineReview from '@/components/VaccineReview';
import Head from '@/components/admin/Head';

export const dynamic = 'force-dynamic';

// วัคซีนรอตรวจ
export default async function Vaccines() {
  const s = await currentStaff();
  if (!s) return null;
  if (!(await canReviewVaccine(s))) return <div className="warn">ไม่มีสิทธิ์ตรวจวัคซีน</div>;
  const rows = await sql`
    select v.id, v.vaccine, to_char(v.expires_on, 'YYYY-MM-DD') as expires_on, v.photo,
           to_char(v.created_at at time zone 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') as at,
           p.name as pet, p.breed, p.weight_kg, c.display_name as customer
    from pet_vaccines v join pets p on p.code = v.pet_code join customers c on c.code = p.customer_code
    where v.status = 'pending' order by v.created_at`;
  const list = await Promise.all(rows.map(async (r) => ({ ...r, url: r.photo ? await signedUrl('vaccines', r.photo) : '' })));
  return (
    <>
      <Head back="/admin/menu" cap={`${list.length} รายการ`} title="วัคซีนรอตรวจ" />
      <div className="sub">ดูชื่อน้อง วันที่ฉีด และวันหมดอายุในรูป แก้วันหมดอายุให้ตรงสมุดก่อนกดผ่าน</div>
      {!list.length && <div className="sub">ไม่มีรายการรอตรวจ</div>}
      {list.map((r) => <VaccineReview key={(r as unknown as { id: number }).id} v={r as unknown as never} />)}
    </>
  );
}

import { sql } from '@/lib/db';
import { currentStaff } from '@/lib/staff';
import StaffAdmin from '@/components/StaffAdmin';

export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const me = await currentStaff();
  if (!me || me.role !== 'owner') return <main className="admin"><div className="warn">เฉพาะเจ้าของร้าน</div></main>;
  const [staff, biz] = await Promise.all([
    sql`select code, display_name, role, businesses, is_groomer, invite_status, line_user_id is not null as linked,
               invite_expires > now() as invite_open from staff order by invite_status = 'removed', code`,
    sql`select code, name from businesses where active order by sort`,
  ]);
  return <StaffAdmin me={me.code} staff={[...staff] as never} businesses={[...biz] as never} />;
}

import { currentStaff } from '@/lib/staff';
import { pendingCounts } from '@/lib/admin';
import StaffLogin from '@/components/StaffLogin';
import AdminTabBar from '@/components/admin/TabBar';

export const dynamic = 'force-dynamic';

// หลังบ้านแบบมือถือ + เมนูล่าง 4 แท็บ
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await currentStaff();
  if (!s) return <StaffLogin mode="login" />;
  const c = await pendingCounts(s);
  return (
    <main className="scr">
      <div className="content">{children}</div>
      <AdminTabBar slips={c.slips} />
    </main>
  );
}

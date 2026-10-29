import Link from 'next/link';
import { currentStaff } from '@/lib/staff';
import StaffLogin from '@/components/StaffLogin';
import LogoutButton from '@/components/LogoutButton';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await currentStaff();
  if (!s) return <StaffLogin mode="login" />;
  return (
    <>
      <nav style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="admin" style={{ flexDirection: 'row', padding: '12px 16px', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <b style={{ flex: 1 }}>หลังบ้าน</b>
          <Link href="/admin">วันนี้</Link>
          <Link href="/admin/slips">สลิป</Link>
          <Link href="/admin/vaccines">วัคซีน</Link>
          {s.role === 'owner' && <Link href="/admin/staff">พนักงาน</Link>}
          <span className="sub">{s.display_name}</span>
          <LogoutButton />
        </div>
      </nav>
      {children}
    </>
  );
}

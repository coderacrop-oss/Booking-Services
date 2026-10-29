import Link from 'next/link';
import { currentStaff } from '@/lib/staff';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await currentStaff();
  if (!s) return <main className="admin"><b>เข้าสู่ระบบด้วย LINE ของพนักงาน</b><div className="sub">ขอลิงก์เชิญจากเจ้าของร้าน</div></main>;
  return (
    <>
      <nav style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="admin" style={{ flexDirection: 'row', padding: '12px 16px', gap: 18, alignItems: 'center' }}>
          <b style={{ flex: 1 }}>หลังบ้าน</b>
          <Link href="/admin">วันนี้</Link>
          <Link href="/admin/slips">สลิป</Link>
          <span className="sub">{s.display_name}</span>
        </div>
      </nav>
      {children}
    </>
  );
}

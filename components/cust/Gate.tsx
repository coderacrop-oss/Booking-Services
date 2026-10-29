import { getSetting } from '@/lib/catalog';
import { me } from '@/lib/me';
import Consent from '@/components/Consent';
import LiffGate from '@/components/LiffGate';
import TabBar from './TabBar';

// ครอบหน้าลูกค้า: ต้องล็อกอิน LINE + ยอมรับ PDPA ก่อน
export async function requireCustomer(): Promise<{ code: string } | { node: React.ReactNode }> {
  const m = await me();
  if (!m.code) return { node: <LiffGate loggedIn={false}><main className="scr"><div className="content"><div className="warn">เปิดหน้านี้ผ่าน LINE ของร้าน</div></div></main></LiffGate> };
  if (!m.consented) return { node: <Consent shop={await getSetting('shop_name', 'ร้าน')} /> };
  return { code: m.code };
}

export function CustScreen({ children, tabs = true }: { children: React.ReactNode; tabs?: boolean }) {
  return (
    <main className="scr">
      <div className="content">{children}</div>
      {tabs && <TabBar />}
    </main>
  );
}

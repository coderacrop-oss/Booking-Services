import { notFound } from 'next/navigation';
import { getBizCatalog, getPets } from '@/lib/catalog';
import { me } from '@/lib/me';
import { todayTH } from '@/lib/thaidate';
import BookingFlow from '@/components/BookingFlow';
import Consent from '@/components/Consent';
import LiffGate from '@/components/LiffGate';

export const dynamic = 'force-dynamic';

// หน้าจองของแต่ละธุรกิจ · ริชเมนูแต่ละอันเปิด LIFF มาที่ /b/<รหัสธุรกิจ>
export default async function BizPage({ params }: { params: Promise<{ biz: string }> }) {
  const { biz } = await params;
  const cat = await getBizCatalog(biz);
  if (!cat) notFound();
  const m = await me();
  if (m.code && !m.consented) return <Consent shop={cat.shop_name} />;
  const pets = m.code ? await getPets(m.code) : [];
  return (
    <LiffGate loggedIn={!!m.code}>
      <BookingFlow cat={cat} pets={pets} loggedIn={!!m.code} today={todayTH()} />
    </LiffGate>
  );
}

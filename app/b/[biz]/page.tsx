import { notFound } from 'next/navigation';
import { getBizCatalog, getPets } from '@/lib/catalog';
import { currentCustomer } from '@/lib/session';
import { todayTH } from '@/lib/thaidate';
import BookingFlow from '@/components/BookingFlow';

export const dynamic = 'force-dynamic';

// หน้าจองของแต่ละธุรกิจ · ริชเมนูแต่ละอันเปิด LIFF มาที่ /b/<รหัสธุรกิจ>
export default async function BizPage({ params }: { params: Promise<{ biz: string }> }) {
  const { biz } = await params;
  const cat = await getBizCatalog(biz);
  if (!cat) notFound();
  const customer = await currentCustomer();
  const pets = customer ? await getPets(customer) : [];
  return <BookingFlow cat={cat} pets={pets} loggedIn={!!customer} today={todayTH()} />;
}

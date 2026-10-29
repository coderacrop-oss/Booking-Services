import { getSetting } from '@/lib/catalog';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back } from '@/components/cust/AccountForms';

export const dynamic = 'force-dynamic';
export default async function Help() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [shop, oa, phone] = await Promise.all([getSetting('shop_name', 'ร้าน'), getSetting('line_oa_id'), getSetting('shop_phone')]);
  return (
    <CustScreen>
      <div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>ติดต่อเจ้าหน้าที่</b></div>
      <div className="note">พิมพ์ในแชท LINE ของ {shop} ได้เลย เจ้าหน้าที่ตอบในเวลาทำการ</div>
      {oa && <a className="btnw dark" href={`https://line.me/R/oaMessage/${encodeURIComponent(oa)}/`}><span className="ms">chat</span>แชทกับร้าน</a>}
      {phone && <a className="btnw line" href={`tel:${phone}`}>โทร {phone}</a>}
    </CustScreen>
  );
}

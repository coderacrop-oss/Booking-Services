import { sql } from '@/lib/db';
import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import { Back, PdpaForm } from '@/components/cust/AccountForms';

export const dynamic = 'force-dynamic';
export default async function Pdpa() {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const [c] = await sql`select consent_news, consent_photo, delete_requested_at is not null as req from customers where code = ${g.code}`;
  return <CustScreen><div className="head"><Back /><b style={{ fontSize: 20, fontWeight: 800 }}>ความยินยอม PDPA</b></div>
    <PdpaForm news={c.consent_news} photo={c.consent_photo} requested={c.req} /></CustScreen>;
}

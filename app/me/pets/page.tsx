import { sql } from '@/lib/db';
import { me } from '@/lib/me';
import { todayTH } from '@/lib/thaidate';
import LiffGate from '@/components/LiffGate';
import Consent from '@/components/Consent';
import PetsManager from '@/components/PetsManager';
import { getSetting } from '@/lib/catalog';

export const dynamic = 'force-dynamic';

// น้องของฉัน: เพิ่มน้อง · ส่งรูปวัคซีน · ดูผลตรวจ
export default async function MyPets({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const m = await me();
  if (!m.code) return <LiffGate loggedIn={false}><main className="app"><div className="body"><div className="warn">เปิดหน้านี้ผ่าน LINE ของร้าน</div></div></main></LiffGate>;
  if (!m.consented) return <Consent shop={await getSetting('shop_name', 'ร้าน')} />;
  const { back } = await searchParams;
  const pets = await sql`
    select p.code, p.name, p.species, p.breed, p.weight_kg, p.note,
      coalesce((select json_agg(json_build_object('id', v.id, 'vaccine', v.vaccine, 'expires_on', to_char(v.expires_on, 'YYYY-MM-DD'),
                                                  'status', v.status, 'reason', v.reject_reason) order by v.created_at desc)
                from pet_vaccines v where v.pet_code = p.code), '[]') as vaccines
    from pets p where p.customer_code = ${m.code} order by p.created_at, p.code`;
  return <PetsManager pets={[...pets] as never} today={todayTH()} back={back && back.startsWith('/b/') ? back : null} />;
}

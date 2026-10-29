import Link from 'next/link';
import { getCatalog } from '@/lib/catalog';
import { bizLook } from '@/lib/look';

export const dynamic = 'force-dynamic';

// หน้าแรก (ปกติลูกค้าเข้าจากริชเมนูตรงไปที่ /b/<ธุรกิจ> · หน้านี้ใช้เมื่อเปิดลิงก์รวม)
export default async function Home() {
  const cat = await getCatalog();
  return (
    <main className="app">
      <div className="topbar"><b>{cat.shop_name}</b></div>
      <div className="body">
        <div className="h1">จองบริการ</div>
        <div className="sub">เลือกบริการที่ต้องการ</div>
        {cat.businesses.map((b) => {
          const L = bizLook(b.code, b.color, b.booking_type);
          return (
            <Link key={b.code} href={`/b/${b.code}`} className="biz" style={{ background: L.bg, color: L.fg }}>
              <span className="ms">{L.icon}</span>
              <span style={{ flex: 1 }}><b>{b.name}</b><small>{b.tagline}</small></span>
              <span className="ms">chevron_right</span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}

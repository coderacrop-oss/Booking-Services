'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ขอความยินยอมครั้งแรก · บอกให้ครบว่าร้านเก็บอะไร ใช้ทำอะไร
export default function Consent({ shop }: { shop: string }) {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    const r = await fetch('/api/me/consent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accept: true, phone }) });
    setBusy(false);
    if (!r.ok) return setErr((await r.json()).message);
    router.refresh();
  };
  return (
    <main className="app">
      <div className="topbar"><b>{shop}</b></div>
      <div className="body">
        <div className="h1">ก่อนเริ่มจอง</div>
        <div className="sub">ร้านเก็บข้อมูลเท่าที่ใช้จองและดูแลน้อง ดังนี้</div>
        <ul className="sub" style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <li>ชื่อและรหัสผู้ใช้ LINE ใช้ยืนยันตัวตนและส่งข้อความยืนยัน/เตือนการจอง</li>
          <li>เบอร์โทร (ถ้ากรอก) ใช้ติดต่อเรื่องการจอง</li>
          <li>ข้อมูลน้อง: ชื่อ สายพันธุ์ น้ำหนัก ข้อควรระวัง และรูปสมุดวัคซีน</li>
          <li>ประวัติการจอง การชำระเงิน และรูปสลิปโอนเงิน</li>
        </ul>
        <div className="sub">ร้านไม่เก็บเลขบัตรประชาชนและไม่ส่งข้อมูลให้ผู้อื่นเพื่อการตลาด ขอดู แก้ หรือลบข้อมูลได้โดยทักแชทร้าน</div>
        <label className="sub" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          เบอร์โทร (ไม่บังคับ)
          <input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxx"
                 style={{ height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 12px' }} />
        </label>
        <button className={'card' + (ok ? ' on' : '')} onClick={() => setOk(!ok)}>
          <span className="t"><b style={{ fontSize: 15 }}>ยอมรับให้ร้านเก็บและใช้ข้อมูลตามที่แจ้ง</b></span><span className="tick">{ok && <span className="ms">check</span>}</span>
        </button>
        {err && <div className="err">{err}</div>}
      </div>
      <div className="bottombar"><div className="in"><div className="sum" /><button className="btn" disabled={!ok || busy} onClick={save}>{busy ? 'รอสักครู่…' : 'เริ่มจอง'}</button></div></div>
    </main>
  );
}

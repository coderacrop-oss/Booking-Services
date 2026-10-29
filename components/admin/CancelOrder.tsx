'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ยกเลิกทุกรายการที่ยังใช้อยู่ในการจองนี้ (กด 2 ครั้ง)
export default function CancelOrder({ codes }: { codes: string[] }) {
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (!codes.length) return null;
  const go = async () => {
    setBusy(true); setErr('');
    for (const c of codes) {
      const r = await fetch(`/api/admin/bookings/${c}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'cancel' }) });
      if (!r.ok) { setErr((await r.json().catch(() => ({}))).message || 'ยกเลิกไม่สำเร็จ'); break; }
    }
    setBusy(false); setAsk(false); router.refresh();
  };
  return (
    <>
      {ask ? <button className="btnw" style={{ background: 'var(--red)', color: '#fff' }} disabled={busy} onClick={go}>{busy ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก · แจ้งลูกค้าใน LINE'}</button>
           : <button className="btnw danger" onClick={() => setAsk(true)}>ยกเลิกการจอง</button>}
      {ask && <div className="cap" style={{ textAlign: 'center' }}>เรื่องคืนเงินมัดจำ ร้านโอนคืนเองตามเงื่อนไขการยกเลิก</div>}
      {err && <div className="err">{err}</div>}
    </>
  );
}

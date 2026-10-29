'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ปุ่มงานหน้าร้านต่อการจอง (ปุ่มขึ้นตามชนิดและสถานะ)
const NEXT: Record<string, Record<string, [string, string]>> = {
  stay: { confirmed: ['check_in', 'เช็กอิน'], checked_in: ['check_out', 'เช็กเอาต์'] },
  session: { confirmed: ['attend', 'เช็กชื่อ'] },
  slot: { confirmed: ['start', 'เริ่มทำ'], in_progress: ['finish', 'เสร็จ · แจ้งเจ้าของ'] },
};

export default function BookingActions({ code, kind, status, paid }: { code: string; kind: string; status: string; paid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState<'' | 'cancel' | 'no_show'>('');
  const [err, setErr] = useState('');
  const go = async (action: string) => {
    setBusy(true); setErr('');
    const r = await fetch(`/api/admin/bookings/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    setBusy(false); setAsk('');
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ทำรายการไม่สำเร็จ');
    router.refresh();
  };
  const n = NEXT[kind]?.[status];
  const sm = { height: 32, padding: '0 12px', fontSize: 13 };
  const active = ['holding', 'confirmed', 'checked_in', 'in_progress'].includes(status);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {n && paid && <button className="btn" style={sm} disabled={busy} onClick={() => go(n[0])}>{n[1]}</button>}
      {status === 'confirmed' && (ask === 'no_show'
        ? <button className="btn red" style={sm} disabled={busy} onClick={() => go('no_show')}>ยืนยันไม่มา</button>
        : <button className="btn ghost" style={sm} onClick={() => setAsk('no_show')}>ไม่มา</button>)}
      {active && (ask === 'cancel'
        ? <button className="btn red" style={sm} disabled={busy} onClick={() => go('cancel')}>ยืนยันยกเลิก</button>
        : <button className="btn ghost" style={{ ...sm, color: 'var(--red-ink)', borderColor: '#F0C9CB' }} onClick={() => setAsk('cancel')}>ยกเลิก</button>)}
      {err && <span style={{ color: 'var(--red-ink)', fontSize: 12 }}>{err}</span>}
    </div>
  );
}

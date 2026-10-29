'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ปุ่มงานหน้าร้าน 1 ปุ่ม (เช็กอิน · เช็กชื่อ · เริ่มทำ · เสร็จ)
export default function ActBtn({ code, action, label, big }: { code: string; action: string; label: string; big?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const go = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    setBusy(true); setErr('');
    const r = await fetch(`/api/admin/bookings/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ไม่สำเร็จ');
    router.refresh();
  };
  return (
    <>
      <button className={big ? 'btnw' : 'pbtn'} style={big ? { background: 'var(--red)', color: '#fff' } : undefined} disabled={busy} onClick={go}>
        {busy ? '…' : label}
      </button>
      {err && <span style={{ color: 'var(--red-ink)', fontSize: 12 }}>{err}</span>}
    </>
  );
}

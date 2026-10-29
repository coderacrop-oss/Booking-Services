'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { thDate } from '@/lib/thaidate';

type V = { id: number; vaccine: string; expires_on: string; at: string; pet: string; breed: string | null; weight_kg: number; customer: string; url: string; photo: string };
const REASONS = ['รูปไม่ชัด อ่านไม่ออก', 'วัคซีนหมดอายุแล้ว', 'ไม่ใช่สมุดของน้องตัวนี้', 'ยังขาดวัคซีนที่ร้านกำหนด'];

export default function VaccineReview({ v }: { v: V }) {
  const router = useRouter();
  const [exp, setExp] = useState(v.expires_on);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [bad, setBad] = useState(false);
  const pdf = v.photo?.endsWith('.pdf');
  const act = async (action: 'approve' | 'reject') => {
    setBusy(action); setErr('');
    const r = await fetch(`/api/admin/vaccines/${v.id}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, expires_on: exp, reason: action === 'reject' ? reason : null }) });
    setBusy('');
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ทำรายการไม่สำเร็จ');
    router.refresh();
  };
  return (
    <section className="card" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <a href={v.url} target="_blank" rel="noreferrer" className="photo" style={{ width: 160, height: 200, flex: 'none' }}>
        {v.url && !pdf && !bad ? <img src={v.url} alt="สมุดวัคซีน" onError={() => setBad(true)} /> : <span>{pdf ? 'เปิด PDF' : 'เปิดรูปไม่ได้'}</span>}
      </a>
      <div className="t" style={{ minWidth: 240, gap: 8 }}>
        <b>{v.pet} · {v.customer}</b>
        <small>{[v.breed, `${v.weight_kg} กก.`].filter(Boolean).join(' · ')} · ส่งเมื่อ {thDate(v.at.slice(0, 10))} {v.at.slice(11)}</small>
        <small>{v.vaccine}</small>
        <label className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>หมดอายุ
          <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '4px 8px' }} /></label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" disabled={!!busy} onClick={() => act('approve')}>{busy === 'approve' ? 'รอสักครู่…' : 'ผ่าน'}</button>
          <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ height: 40, borderRadius: 10, border: '1.5px solid var(--line)', padding: '0 8px' }}>
            {REASONS.map((r) => <option key={r}>{r}</option>)}
          </select>
          <button className="btn ghost" disabled={!!busy} onClick={() => act('reject')}>{busy === 'reject' ? 'รอสักครู่…' : 'ไม่ผ่าน'}</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
    </section>
  );
}

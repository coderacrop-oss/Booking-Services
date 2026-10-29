'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PetForm({ back }: { back: string | null }) {
  const router = useRouter();
  const [f, setF] = useState({ name: '', species: 'dog', breed: '', weight_kg: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    const r = await fetch('/api/me/pets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, weight_kg: Number(f.weight_kg) }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErr(j.message || 'เพิ่มไม่สำเร็จ');
    router.replace(`/me/pets/${j.code}${back ? `?back=${encodeURIComponent(back)}` : ''}`);
  };
  return (
    <>
      <button className="back" onClick={() => router.back()}><span className="ms">arrow_back</span></button>
      <div className="title">เพิ่มน้อง</div>
      <input className="input" placeholder="ชื่อน้อง" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      <div className="segbox">{[['dog', 'หมา'], ['cat', 'แมว']].map(([k, l]) => <button key={k} className={f.species === k ? 'on' : ''} onClick={() => setF({ ...f, species: k })}>{l}</button>)}</div>
      <input className="input" placeholder="สายพันธุ์ (ไม่บังคับ)" value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} />
      <input className="input" inputMode="decimal" placeholder="น้ำหนัก (กก.)" value={f.weight_kg} onChange={(e) => setF({ ...f, weight_kg: e.target.value })} />
      <div className="note">น้ำหนักใช้คิดราคา Grooming และแบ่งรอบสระ · ส่งรูปวัคซีนได้ในหน้าถัดไป</div>
      {err && <div className="err">{err}</div>}
      <button className="btnw dark" disabled={busy || !f.name || !f.weight_kg} onClick={save}>{busy ? 'รอสักครู่…' : 'บันทึก'}</button>
    </>
  );
}

'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { thDay } from '@/lib/thaidate';
import { TopBar } from './ui';

type V = { id: number; vaccine: string; expires_on: string; status: 'pending' | 'approved' | 'rejected'; reason: string | null };
type P = { code: string; name: string; species: string; breed: string | null; weight_kg: number; note: string | null; vaccines: V[] };

const field = { height: 44, borderRadius: 12, border: '1.5px solid var(--line)', padding: '0 12px', width: '100%' } as const;
const VST: Record<V['status'], [string, string]> = { pending: ['รอร้านตรวจ', 'var(--amber)'], approved: ['ผ่านแล้ว', 'var(--green)'], rejected: ['ไม่ผ่าน', 'var(--red-ink)'] };

export default function PetsManager({ pets, today, back }: { pets: P[]; today: string; back: string | null }) {
  const router = useRouter();
  const [adding, setAdding] = useState(pets.length === 0);
  const [f, setF] = useState({ name: '', species: 'dog', breed: '', weight_kg: '', note: '' });
  const [vaxFor, setVaxFor] = useState<string | null>(null);
  const [vax, setVax] = useState({ vaccine: 'รวม 5 โรค', expires_on: '' });
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const addPet = async () => {
    setBusy(true); setErr('');
    const r = await fetch('/api/me/pets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...f, weight_kg: Number(f.weight_kg) }) });
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'เพิ่มไม่สำเร็จ');
    setAdding(false); setF({ name: '', species: 'dog', breed: '', weight_kg: '', note: '' }); router.refresh();
  };
  const sendVax = async (pet: string) => {
    const fl = file.current?.files?.[0];
    if (!fl) return setErr('เลือกรูปสมุดวัคซีน');
    setBusy(true); setErr('');
    const fd = new FormData(); fd.append('file', fl); fd.append('vaccine', vax.vaccine); fd.append('expires_on', vax.expires_on);
    const r = await fetch(`/api/me/pets/${pet}/vaccine`, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ส่งไม่สำเร็จ');
    setVaxFor(null); router.refresh();
  };

  return (
    <main className="app">
      <TopBar title="น้องของฉัน" onBack={() => router.push(back || '/me')} />
      <div className="body">
        {err && <div className="err">{err}</div>}
        {pets.map((p) => {
          const ok = p.vaccines.find((v) => v.status === 'approved' && v.expires_on >= today);
          return (
            <div key={p.code} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span className="t"><b>{p.name}</b><small>{[p.species === 'cat' ? 'แมว' : 'หมา', p.breed, `${p.weight_kg} กก.`].filter(Boolean).join(' · ')}</small></span>
                <span className="pill" style={{ background: ok ? 'var(--green-soft)' : 'var(--amber-soft)', color: ok ? 'var(--green)' : 'var(--amber)', alignSelf: 'flex-start' }}>
                  {ok ? `วัคซีนถึง ${thDay(ok.expires_on)}` : 'ยังไม่มีวัคซีนที่ผ่าน'}
                </span>
              </div>
              {p.vaccines.map((v) => (
                <small key={v.id} className="sub">{v.vaccine} · หมด {thDay(v.expires_on)} · <span style={{ color: VST[v.status][1], fontWeight: 700 }}>{VST[v.status][0]}</span>{v.reason ? ` — ${v.reason}` : ''}</small>
              ))}
              {vaxFor === p.code ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <input style={field} value={vax.vaccine} onChange={(e) => setVax({ ...vax, vaccine: e.target.value })} placeholder="ชื่อวัคซีน เช่น รวม 5 โรค" />
                  <label className="sub">วันหมดอายุ (ดูในสมุดวัคซีน)<input type="date" style={field} min={today} value={vax.expires_on} onChange={(e) => setVax({ ...vax, expires_on: e.target.value })} /></label>
                  <input ref={file} type="file" accept="image/*,application/pdf" />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn" disabled={busy || !vax.expires_on} onClick={() => sendVax(p.code)}>{busy ? 'กำลังส่ง…' : 'ส่งให้ร้านตรวจ'}</button>
                    <button className="btn ghost" onClick={() => setVaxFor(null)}>ยกเลิก</button>
                  </div>
                </div>
              ) : (
                <button className="btn ghost" style={{ height: 40, alignSelf: 'flex-start' }} onClick={() => { setVaxFor(p.code); setErr(''); }}>
                  <span className="ms">vaccines</span>ส่งรูปวัคซีน
                </button>
              )}
            </div>
          );
        })}
        {adding ? (
          <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <b>เพิ่มน้อง</b>
            <input style={field} placeholder="ชื่อน้อง" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              {[['dog', 'หมา'], ['cat', 'แมว']].map(([k, l]) => <button key={k} className={'chip' + (f.species === k ? ' on' : '')} onClick={() => setF({ ...f, species: k })}><b>{l}</b></button>)}
            </div>
            <input style={field} placeholder="สายพันธุ์ (ไม่บังคับ)" value={f.breed} onChange={(e) => setF({ ...f, breed: e.target.value })} />
            <input style={field} inputMode="decimal" placeholder="น้ำหนัก (กก.) ใช้คิดราคาและแบ่งรอบสระ" value={f.weight_kg} onChange={(e) => setF({ ...f, weight_kg: e.target.value })} />
            <input style={field} placeholder="ฝากบอกร้าน เช่น กลัวเสียงไดร์ (ไม่บังคับ)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" disabled={busy || !f.name || !f.weight_kg} onClick={addPet}>{busy ? 'รอสักครู่…' : 'บันทึก'}</button>
              {pets.length > 0 && <button className="btn ghost" onClick={() => setAdding(false)}>ยกเลิก</button>}
            </div>
          </div>
        ) : (
          <button className="btn ghost" onClick={() => setAdding(true)}><span className="ms">add</span>เพิ่มน้อง</button>
        )}
        {back && <button className="btn" onClick={() => router.push(back)}>กลับไปจอง</button>}
      </div>
    </main>
  );
}

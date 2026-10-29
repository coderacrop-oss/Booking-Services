'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { thDay } from '@/lib/thaidate';
import { vaxState } from '@/lib/vax';
import { Photo } from '../ui';

type V = { id: number; vaccine: string; expires_on: string; status: 'pending' | 'approved' | 'rejected'; reason: string | null };
type P = { code: string; name: string; species: string; breed: string | null; weight_kg: number; tags: string[]; vaccines: V[] };
const VST = { pending: ['รอร้านตรวจ', 'var(--amber)'], approved: ['ผ่านแล้ว', 'var(--green)'], rejected: ['ไม่ผ่าน', 'var(--red-ink)'] } as const;

export default function PetDetail({ pet, today, tags, back }: { pet: P; today: string; tags: string[]; back: string | null }) {
  const router = useRouter();
  const [my, setMy] = useState<string[]>(pet.tags);
  const [open, setOpen] = useState(false);
  const [vax, setVax] = useState({ vaccine: 'รวม 5 โรค', expires_on: '' });
  const [kg, setKg] = useState(String(pet.weight_kg));
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const st = vaxState(pet.vaccines, today);
  const ok = st[2] === 'var(--green)';

  const patch = async (body: object) => {
    const r = await fetch(`/api/me/pets/${pet.code}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) setErr((await r.json().catch(() => ({}))).message || 'บันทึกไม่สำเร็จ');
  };
  const toggle = (t: string) => { const n = my.includes(t) ? my.filter((x) => x !== t) : [...my, t]; setMy(n); patch({ tags: n }); };
  const send = async () => {
    const f = file.current?.files?.[0];
    if (!f) return setErr('เลือกรูปสมุดวัคซีน');
    setBusy(true); setErr('');
    const fd = new FormData(); fd.append('file', f); fd.append('vaccine', vax.vaccine); fd.append('expires_on', vax.expires_on);
    const r = await fetch(`/api/me/pets/${pet.code}/vaccine`, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ส่งไม่สำเร็จ');
    setOpen(false); router.refresh();
  };

  return (
    <>
      <button className="back" onClick={() => router.push(back ? `/me/pets?back=${encodeURIComponent(back)}` : '/me/pets')}><span className="ms">arrow_back</span></button>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden', flex: 'none' }}><Photo h={80} label="" /></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <b style={{ fontSize: 26, fontWeight: 800 }}>{pet.name}</b>
          <span className="cap">{[pet.breed, `${pet.weight_kg} กก.`].filter(Boolean).join(' · ')}</span>
        </div>
      </div>

      <div className="bill" style={{ gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ms">vaccines</span><b style={{ flex: 1 }}>สมุดวัคซีน</b>
          <span className="pill" style={{ background: st[1], color: st[2] }}>{st[0]}</span>
        </div>
        <span className="cap">{ok ? 'ร้านตรวจสมุดวัคซีนแล้ว จองได้ทุกบริการ' : 'สระและ Pet hotel ต้องมีวัคซีนที่ร้านตรวจแล้ว'}</span>
        {pet.vaccines.map((v) => (
          <small key={v.id} className="cap">{v.vaccine} · หมด {thDay(v.expires_on)} · <b style={{ color: VST[v.status][1] }}>{VST[v.status][0]}</b>{v.reason ? ` — ${v.reason}` : ''}</small>
        ))}
        {!open && <button className="btnw line" style={{ height: 40, marginTop: 4 }} onClick={() => setOpen(true)}><span className="ms">add_a_photo</span>ส่งรูปสมุดวัคซีน</button>}
        {open && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            <input className="input" value={vax.vaccine} onChange={(e) => setVax({ ...vax, vaccine: e.target.value })} placeholder="ชื่อวัคซีน" />
            <label className="cap">วันหมดอายุ (ดูในสมุด)<input className="input" type="date" min={today} value={vax.expires_on} onChange={(e) => setVax({ ...vax, expires_on: e.target.value })} /></label>
            <input ref={file} type="file" accept="image/*,application/pdf" />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btnw dark" disabled={busy || !vax.expires_on} onClick={send}>{busy ? 'กำลังส่ง…' : 'ส่งให้ร้านตรวจ'}</button>
              <button className="btnw line" onClick={() => setOpen(false)}>ยกเลิก</button>
            </div>
          </div>
        )}
      </div>

      <div className="grp">ข้อควรระวัง · ร้านเห็นทุกครั้งที่จอง</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {[...new Set([...tags, ...my])].map((t) => <button key={t} className={'tagchip' + (my.includes(t) ? ' on' : '')} onClick={() => toggle(t)}>{t}</button>)}
      </div>

      <div className="grp">น้ำหนัก</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" inputMode="decimal" value={kg} onChange={(e) => setKg(e.target.value)} style={{ flex: 1 }} />
        <button className="pbtn" style={{ height: 44 }} disabled={Number(kg) === Number(pet.weight_kg)} onClick={async () => { await patch({ weight_kg: Number(kg) }); router.refresh(); }}>บันทึก</button>
      </div>
      <div className="cap">น้ำหนักใช้คิดราคา Grooming และแบ่งรอบสระ</div>
      {err && <div className="err">{err}</div>}
      {back && <button className="btnw dark" onClick={() => router.push(back)}>กลับไปจองต่อ</button>}
    </>
  );
}

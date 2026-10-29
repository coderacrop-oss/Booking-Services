'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { addDays, thDate, todayTH } from '@/lib/thaidate';

type P = { code: string; kind: string; business: string; date: string; nights: number; service: string | null; addons: string[]; tier: string | null; kg: number[]; session: string | null };
type Sess = { code: string; start: string; end: string; left: number; free: boolean; reason: string | null };
type Slot = { start: string; staff: string; staff_name: string };

// เลื่อนวัน: เลือกวัน (+ คืน / รอบ / เวลา) แล้วระบบเช็กที่ว่างอีกครั้งตอนบันทึก
export default function Reschedule({ p }: { p: P }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(p.date < todayTH() ? todayTH() : p.date);
  const [nights, setNights] = useState(p.nights);
  const [sess, setSess] = useState<Sess[] | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [pick, setPick] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!open) return;
    setPick(''); setSess(null); setSlots(null);
    if (p.kind === 'session') fetch(`/api/availability?type=session&biz=${p.business}&date=${date}&kg=${p.kg.join(',')}`).then((r) => r.json()).then((j) => setSess(j.sessions ?? []));
    if (p.kind === 'slot' && p.service) fetch(`/api/availability?type=slot&biz=${p.business}&date=${date}&service=${p.service}&addons=${p.addons.join(',')}&tier=${p.tier ?? ''}`).then((r) => r.json()).then((j) => setSlots(j.slots ?? []));
  }, [open, date, p]);

  const save = async () => {
    setBusy(true); setErr('');
    const body: Record<string, unknown> = { action: 'reschedule', date };
    if (p.kind === 'stay') body.nights = nights;
    if (p.kind === 'session') body.session = pick;
    if (p.kind === 'slot') { const s = slots?.find((x) => x.start + '|' + x.staff === pick); body.time = s?.start; body.staff = s?.staff; }
    const r = await fetch(`/api/admin/bookings/${p.code}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'เลื่อนไม่สำเร็จ');
    setOpen(false); router.refresh();
  };

  if (!open) return <button className="btnw line" style={{ height: 40 }} onClick={() => setOpen(true)}>เลื่อนวัน</button>;
  const ready = p.kind === 'stay' ? nights >= 1 : !!pick;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--soft)', borderRadius: 14, padding: 12 }}>
      <b style={{ fontSize: 14 }}>เลื่อนเป็นวัน</b>
      <input className="input" type="date" min={todayTH()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
      {p.kind === 'stay' && (
        <div className="seg">{[1, 2, 3, 4, 5, 6, 7].map((n) => <button key={n} className={nights === n ? 'on' : ''} onClick={() => setNights(n)}>{n} คืน</button>)}</div>
      )}
      {p.kind === 'stay' && <span className="cap">{thDate(date)} → {thDate(addDays(date, nights))}</span>}
      {p.kind === 'session' && (sess === null ? <span className="cap">กำลังโหลดรอบ…</span> : !sess.length ? <span className="cap">วันนี้ไม่มีรอบ</span> : (
        <div className="seg">{sess.map((s) => <button key={s.code} disabled={!s.free && s.code !== p.session} className={pick === s.code ? 'on' : ''} onClick={() => setPick(s.code)}>{s.start} · {s.free ? `เหลือ ${s.left}` : s.reason}</button>)}</div>
      ))}
      {p.kind === 'slot' && (slots === null ? <span className="cap">กำลังโหลดเวลา…</span> : !slots.length ? <span className="cap">วันนี้คิวเต็ม</span> : (
        <div className="seg">{slots.map((s) => <button key={s.start + s.staff} className={pick === s.start + '|' + s.staff ? 'on' : ''} onClick={() => setPick(s.start + '|' + s.staff)}>{s.start} · พี่{s.staff_name}</button>)}</div>
      ))}
      <span className="cap">ราคาเท่าเดิม · ระบบส่ง LINE แจ้งลูกค้าและแก้ปฏิทินให้</span>
      {err && <div className="err">{err}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btnw dark" disabled={busy || !ready} onClick={save}>{busy ? 'กำลังเลื่อน…' : 'ยืนยันเลื่อนวัน'}</button>
        <button className="btnw line" onClick={() => setOpen(false)}>ปิด</button>
      </div>
    </div>
  );
}

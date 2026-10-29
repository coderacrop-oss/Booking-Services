'use client';
import { useState } from 'react';
import { baht } from '@/lib/thaidate';
import { Switch, useSave } from './util';

type P = { tier_code: string; price: number; duration_min: number };
type S = { code: string; business_code: string; name: string; kind: 'main' | 'addon'; description: string | null; price_mode: 'flat' | 'by_weight'; price: number | null; duration_min: number | null; active: boolean; prices: P[] };
type T = { code: string; label: string };

// ราคา Grooming: บริการหลัก (ตามขนาด) · บริการเสริม
export default function Groom({ services, tiers, biz }: { services: S[]; tiers: T[]; biz: string }) {
  const [tab, setTab] = useState<'main' | 'addon'>('main');
  const [open, setOpen] = useState<string | null>(null);
  const { save, Msg } = useSave();
  const list = services.filter((s) => s.kind === tab);
  const blank: S = { code: '', business_code: biz, name: '', kind: tab, description: '', price_mode: tab === 'main' ? 'by_weight' : 'flat', price: tab === 'addon' ? 100 : null,
    duration_min: tab === 'addon' ? 10 : null, active: true, prices: tiers.map((t) => ({ tier_code: t.code, price: 0, duration_min: 60 })) };
  const range = (s: S) => s.price_mode === 'flat' ? `${baht(Number(s.price))} · ${s.duration_min} นาที`
    : s.prices.length ? `${baht(Math.min(...s.prices.map((p) => Number(p.price))))}–${Number(Math.max(...s.prices.map((p) => Number(p.price)))).toLocaleString()} · ตามขนาด ${s.prices.length} ช่วง` : 'ยังไม่ตั้งราคา';
  return (
    <>
      <div className="segbox"><button className={tab === 'main' ? 'on' : ''} onClick={() => setTab('main')}>หลัก</button><button className={tab === 'addon' ? 'on' : ''} onClick={() => setTab('addon')}>เสริม</button></div>
      <Msg />
      <div className="list">
        {list.map((s) => (
          <div key={s.code} style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="li" style={{ borderBottom: 0, cursor: 'pointer' }} onClick={() => setOpen(open === s.code ? null : s.code)}>
              <span className="t"><b>{s.name}</b><small>{range(s)}</small>{s.description && <small>{s.description}</small>}</span>
              <Switch on={s.active} onChange={(v) => save('service.active', { code: s.code, active: v }, v ? 'เปิดบริการแล้ว' : 'ปิดบริการแล้ว')} />
            </div>
            {open === s.code && <Form s={s} tiers={tiers} onDone={() => setOpen(null)} />}
          </div>
        ))}
        {open === 'new' && <Form s={blank} tiers={tiers} onDone={() => setOpen(null)} />}
      </div>
      {open !== 'new' && <button className="btnw line" onClick={() => setOpen('new')}>+ เพิ่มบริการ{tab === 'main' ? 'หลัก' : 'เสริม'}</button>}
    </>
  );
}

function Form({ s, tiers, onDone }: { s: S; tiers: T[]; onDone: () => void }) {
  const [f, setF] = useState({ ...s, description: s.description ?? '', prices: tiers.map((t) => s.prices.find((p) => p.tier_code === t.code) ?? { tier_code: t.code, price: 0, duration_min: 60 }) });
  const { save, busy, Msg } = useSave();
  const setP = (i: number, k: 'price' | 'duration_min', v: string) => setF({ ...f, prices: f.prices.map((p, j) => (j === i ? { ...p, [k]: Number(v) || 0 } : p)) });
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--soft)' }}>
      <label className="cap">ชื่อบริการ<input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="cap">คำอธิบาย<input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
      {f.kind === 'main' && <div className="segbox"><button className={f.price_mode === 'by_weight' ? 'on' : ''} onClick={() => setF({ ...f, price_mode: 'by_weight' })}>ตามขนาดน้อง</button><button className={f.price_mode === 'flat' ? 'on' : ''} onClick={() => setF({ ...f, price_mode: 'flat' })}>ราคาเดียว</button></div>}
      {f.price_mode === 'by_weight' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, alignItems: 'center' }}>
          <small className="cap">ขนาด</small><small className="cap">ราคา</small><small className="cap">นาที</small>
          {f.prices.map((p, i) => [
            <b key={p.tier_code + 'l'} style={{ fontSize: 14 }}>{tiers.find((t) => t.code === p.tier_code)?.label}</b>,
            <input key={p.tier_code + 'p'} className="input num" inputMode="decimal" value={p.price} onChange={(e) => setP(i, 'price', e.target.value)} />,
            <input key={p.tier_code + 'm'} className="input num" inputMode="numeric" value={p.duration_min} onChange={(e) => setP(i, 'duration_min', e.target.value)} />,
          ])}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <label className="cap" style={{ flex: 1 }}>ราคา<input className="input num" inputMode="decimal" value={f.price ?? ''} onChange={(e) => setF({ ...f, price: Number(e.target.value) || 0 })} /></label>
          <label className="cap" style={{ flex: 1 }}>ใช้เวลา (นาที)<input className="input num" inputMode="numeric" value={f.duration_min ?? ''} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) || 0 })} /></label>
        </div>
      )}
      <Msg />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btnw dark" disabled={busy} onClick={async () => { if (await save('service.save', f)) onDone(); }}>{s.code ? 'บันทึก' : 'เพิ่ม'}</button>
        <button className="btnw line" onClick={onDone}>ปิด</button>
      </div>
    </div>
  );
}

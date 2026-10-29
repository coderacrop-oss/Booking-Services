'use client';
import { useState } from 'react';
import { photoUrl } from '@/lib/look';

// ชิ้นส่วนหน้าจอที่ใช้ซ้ำ (หน้าตาตามจอโปรโตไทป์)

export function TopBar({ title, step, onBack }: { title: string; step?: string; onBack?: () => void }) {
  return (
    <div className="topbar">
      <button aria-label="ย้อนกลับ" onClick={onBack} style={{ visibility: onBack ? 'visible' : 'hidden' }}>
        <span className="ms">arrow_back</span>
      </button>
      <b>{title}</b>
      {step && <span className="step">{step}</span>}
    </div>
  );
}

export function Progress({ n, at }: { n: number; at: number }) {
  return <div className="progress">{Array.from({ length: n }, (_, i) => <i key={i} className={i <= at ? 'on' : ''} />)}</div>;
}

export function Tick({ on }: { on: boolean }) {
  return <span className="tick">{on && <span className="ms">check</span>}</span>;
}

export function Photo({ file, h, label = 'รูป' }: { file?: string | null; h?: number; label?: string }) {
  const [bad, setBad] = useState(false);
  const url = photoUrl(file);
  return (
    <div className="photo" style={h ? { height: h, width: h, flex: 'none' } : undefined}>
      {url && !bad ? <img src={url} alt="" onError={() => setBad(true)} /> : <span>{label}</span>}
    </div>
  );
}

export function Chip({ on, disabled, title, sub, onClick }:
  { on: boolean; disabled?: boolean; title: string; sub?: string; onClick: () => void }) {
  return (
    <button className={'chip' + (on ? ' on' : '')} disabled={disabled} onClick={onClick}>
      <b>{title}</b>{sub && <small>{sub}</small>}
    </button>
  );
}

export function BottomBar({ note, amount, label, disabled, red, onClick, busy }:
  { note: string; amount: string; label: string; disabled?: boolean; red?: boolean; onClick: () => void; busy?: boolean }) {
  return (
    <div className="bottombar">
      <div className="in">
        <div className="sum"><small>{note}</small><b className="num">{amount}</b></div>
        <button className={'btn' + (red ? ' red' : '')} disabled={disabled || busy} onClick={onClick}>{busy ? 'รอสักครู่…' : label}</button>
      </div>
    </div>
  );
}

export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper">
      <button aria-label="ลด" disabled={value <= min} onClick={() => onChange(value - 1)}><span className="ms">remove</span></button>
      <b className="num">{value}</b>
      <button aria-label="เพิ่ม" disabled={value >= max} onClick={() => onChange(value + 1)}><span className="ms">add</span></button>
    </div>
  );
}

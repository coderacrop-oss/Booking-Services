'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

// ส่งคำสั่งตั้งค่า + แจ้งผล
export function useSave() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (kind: string, data: object, okText = 'บันทึกแล้ว') => {
    setBusy(true); setMsg(null);
    const r = await fetch('/api/admin/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, ...data }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    setMsg(r.ok ? { ok: true, t: okText } : { ok: false, t: j.message || 'บันทึกไม่สำเร็จ' });
    if (r.ok) router.refresh();
    return r.ok ? j : null;
  };
  const Msg = () => (msg ? <div className={msg.ok ? 'note' : 'err'}>{msg.t}</div> : null);
  return { save, busy, Msg };
}

export function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button type="button" className={'switch' + (on ? ' on' : '')} aria-pressed={on} onClick={(e) => { e.stopPropagation(); onChange(!on); }} />;
}

export const DAYS = [[1, 'จ'], [2, 'อ'], [3, 'พ'], [4, 'พฤ'], [5, 'ศ'], [6, 'ส'], [7, 'อา']] as const;
export function DayPick({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  return (
    <div className="seg">
      {DAYS.map(([n, l]) => <button type="button" key={n} className={value.includes(n) ? 'on' : ''} onClick={() => onChange(value.includes(n) ? value.filter((x) => x !== n) : [...value, n].sort())}>{l}</button>)}
    </div>
  );
}

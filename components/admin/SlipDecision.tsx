'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht } from '@/lib/thaidate';

const REASONS = ['ยอดไม่ครบ · ขอส่วนที่ขาด', 'ไม่พบเงินเข้าบัญชี', 'สลิปไม่ใช่ของการจองนี้'];

// เทียบยอด แล้วกดผ่าน / ไม่ผ่าน (ปุ่มติดล่างตามโปรโตไทป์)
export default function SlipDecision({ code, due, slip }: { code: string; due: number; slip: number | null }) {
  const router = useRouter();
  const [amt, setAmt] = useState(slip === null ? '' : String(slip));
  const [sheet, setSheet] = useState(false);
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const n = amt === '' ? null : Number(amt);
  const bad = n !== null && n !== due;
  const act = async (action: 'approve' | 'reject') => {
    setBusy(action); setErr('');
    const r = await fetch(`/api/admin/payments/${code}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, amount_slip: n, reason: action === 'reject' ? reason : null }) });
    setBusy('');
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ทำรายการไม่สำเร็จ');
    router.push('/admin/slips'); router.refresh();
  };
  return (
    <>
      {bad && <div className="err">ยอดไม่ตรงกับที่ควรได้ ({n! < due ? `ขาด ${baht(due - n!)}` : `เกิน ${baht(n! - due)}`})</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr 24px', gap: 8, alignItems: 'center', fontSize: 15 }}>
        <span /><small className="cap">ควรได้</small><small className="cap">ในสลิป</small><span />
        <span className="cap">ยอด</span><b className="num">{baht(due)}</b>
        <input className="input num" inputMode="decimal" placeholder="ดูจากสลิป" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ color: bad ? 'var(--red-ink)' : undefined, fontWeight: 800 }} />
        <span className="ms" style={{ color: bad ? 'var(--red-ink)' : n !== null ? 'var(--green)' : 'var(--ink-3)' }}>{bad ? 'flag' : 'check_circle'}</span>
      </div>
      <div className="note">เทียบชื่อผู้รับในสลิปกับบัญชีร้าน และดูว่าเลขอ้างอิงไม่ซ้ำกับสลิปก่อนหน้า</div>
      {err && <div className="err">{err}</div>}
      {sheet && (
        <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
          <b>เหตุผลที่ไม่ผ่าน (แจ้งลูกค้าใน LINE)</b>
          {REASONS.map((r) => <button key={r} className={'tagchip' + (reason === r ? ' on' : '')} style={{ justifyContent: 'flex-start' }} onClick={() => setReason(r)}>{r}</button>)}
          <button className="btnw" style={{ background: 'var(--red)', color: '#fff' }} disabled={!!busy} onClick={() => act('reject')}>{busy === 'reject' ? 'รอสักครู่…' : 'ส่งผลไม่ผ่าน'}</button>
        </div>
      )}
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 64, zIndex: 6, background: 'var(--bg)', borderTop: '1px solid var(--line)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '12px 18px', display: 'flex', gap: 10 }}>
          <button className="btnw line" style={{ flex: 1 }} onClick={() => setSheet(!sheet)}><span className="ms">close</span>ไม่ผ่าน</button>
          <button className="btnw green" style={{ flex: 1.3 }} disabled={!!busy || n === null} onClick={() => act('approve')}><span className="ms">check</span>{busy === 'approve' ? 'รอสักครู่…' : 'ผ่าน'}</button>
        </div>
      </div>
      <div style={{ height: 80 }} />
    </>
  );
}

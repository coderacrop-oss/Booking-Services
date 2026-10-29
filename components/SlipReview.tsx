'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht, thDate } from '@/lib/thaidate';

type P = { code: string; order_code: string; amount_due: number; at: string; customer: string; phone: string | null; url: string;
           items: { code: string; biz: string; item: string; s: string; price: number }[] };
const REASONS = ['ยอดไม่ครบ · ขอส่วนที่ขาด', 'ไม่พบเงินเข้าบัญชี', 'สลิปไม่ใช่ของการจองนี้'];

export default function SlipReview({ p }: { p: P }) {
  const router = useRouter();
  const [amt, setAmt] = useState(String(p.amount_due));
  const [reason, setReason] = useState(REASONS[0]);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [bad, setBad] = useState(false);
  const diff = Number(amt) - Number(p.amount_due);

  const act = async (action: 'approve' | 'reject') => {
    setBusy(action); setErr('');
    const r = await fetch(`/api/admin/payments/${p.code}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action, amount_slip: amt === '' ? null : Number(amt), reason: action === 'reject' ? reason : null }) });
    setBusy('');
    if (!r.ok) return setErr((await r.json().catch(() => ({}))).message || 'ทำรายการไม่สำเร็จ');
    router.refresh();
  };

  return (
    <section className="card" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <a href={p.url} target="_blank" rel="noreferrer" className="photo" style={{ width: 160, height: 220, flex: 'none' }}>
        {p.url && !bad ? <img src={p.url} alt="สลิป" onError={() => setBad(true)} /> : <span>เปิดรูปไม่ได้</span>}
      </a>
      <div className="t" style={{ minWidth: 240, gap: 8 }}>
        <b>{p.order_code} · {p.customer}</b>
        <small>แนบเมื่อ {thDate(p.at.slice(0, 10))} {p.at.slice(11)}{p.phone ? ` · ${p.phone}` : ''}</small>
        {p.items.map((i) => <small key={i.code}>{i.biz} · {i.item} · {thDate(i.s.slice(0, 10))} {i.s.slice(11)} · {baht(i.price)}</small>)}
        <div className="bill">
          <div className="l tot"><span>ยอดที่ควรได้</span><span className="num">{baht(p.amount_due)}</span></div>
          <label className="l"><span>ยอดในสลิป</span>
            <input className="num" inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 110, textAlign: 'right', border: '1.5px solid var(--line)', borderRadius: 8, padding: '4px 8px' }} /></label>
          {amt !== '' && diff !== 0 && <div className="l" style={{ color: 'var(--red-ink)', fontWeight: 700 }}><span>ยอดไม่ตรง</span><span className="num">{diff > 0 ? '+' : ''}{baht(diff)}</span></div>}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn" disabled={!!busy} onClick={() => act('approve')}>{busy === 'approve' ? 'รอสักครู่…' : 'สลิปผ่าน · ยืนยันการจอง'}</button>
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

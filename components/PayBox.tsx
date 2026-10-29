'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht, thDate } from '@/lib/thaidate';
import type { OrderView } from '@/lib/types';
import { TopBar } from './ui';

type Order = OrderView;

const pad = (n: number) => String(n).padStart(2, '0');

export default function PayBox({ order, qr, account, shop }: { order: Order; qr: string; account: string; shop: string }) {
  const router = useRouter();
  const file = useRef<HTMLInputElement>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!order.hold_until || order.status !== 'holding') return;
    const end = new Date(order.hold_until).getTime();
    const t = setInterval(() => setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000))), 1000);
    setLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    return () => clearInterval(t);
  }, [order.hold_until, order.status]);

  const upload = async (f: File) => {
    setBusy(true); setErr('');
    const fd = new FormData(); fd.append('slip', f);
    const r = await fetch(`/api/orders/${order.code}/slip`, { method: 'POST', body: fd });
    setBusy(false);
    if (!r.ok) { setErr((await r.json().catch(() => ({}))).message || 'แนบสลิปไม่สำเร็จ'); return; }
    router.refresh();
  };

  const expired = order.status === 'expired' || order.late || left === 0;
  const waiting = order.status === 'pending_review';
  const paid = order.status === 'paid';

  return (
    <main className="app">
      <TopBar title="ชำระเงิน" step={order.code} onBack={() => router.push('/me')} />
      <div className="body" style={{ alignItems: 'stretch' }}>
        {paid && <div className="card on"><span className="ms ok">check</span><span className="t"><b>ยืนยันการจองแล้ว</b><small>ร้านตรวจสลิปเรียบร้อย</small></span></div>}
        {waiting && <div className="warn"><span className="ms">schedule</span>แนบสลิปแล้ว รอร้านตรวจ · ผลจะแจ้งในแชท LINE</div>}
        {expired && !waiting && !paid && <div className="err">หมดเวลากันที่แล้ว กรุณาจองใหม่</div>}
        {order.last_payment?.status === 'rejected' && order.status === 'holding' && (
          <div className="err">สลิปก่อนหน้าไม่ผ่าน: {order.last_payment.reason} · แนบสลิปใหม่ได้</div>
        )}

        {order.status === 'holding' && !expired && (
          <>
            <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center' }}>
              <div className="sub">สแกนจ่าย · {shop}</div>
              <div className="num" style={{ fontSize: 36, fontWeight: 800 }}>{baht(order.due_now)}</div>
              {left !== null && <div style={{ color: 'var(--red-ink)', fontSize: 14, fontWeight: 700 }}>กันที่ไว้ให้อีก {pad(Math.floor(left / 60))}:{pad(left % 60)} นาที</div>}
              <div style={{ width: 230, height: 230, border: '2px solid var(--ink)', borderRadius: 16, padding: 10, background: '#fff' }}
                   dangerouslySetInnerHTML={{ __html: qr || '<div style="display:grid;place-items:center;height:100%;color:#9a9a96">ร้านยังไม่ได้ตั้งเลขพร้อมเพย์</div>' }} />
              {account && <div className="sub">โอนเข้า {account}</div>}
            </div>
            <ol className="sub" style={{ paddingLeft: 20 }}>
              <li>บันทึกรูป QR หรือสแกนจากแอปธนาคาร</li>
              <li>โอนยอดตามที่แสดง</li>
              <li>กลับมาแนบสลิปที่นี่</li>
            </ol>
            {err && <div className="err">{err}</div>}
          </>
        )}

        <div className="section">รายการในทริปนี้</div>
        <div className="bill">
          {order.items.map((i) => (
            <div key={i.code} className="l"><span>{i.biz} · {i.item}{i.pets ? ` · ${i.pets}` : ''}<br /><small>{thDate(i.s.slice(0, 10))} {i.s.slice(11)}</small></span><span className="num">{baht(i.price)}</span></div>
          ))}
          <hr />
          <div className="l tot"><span>รวม</span><span className="num">{baht(order.total)}</span></div>
          <div className="l"><span>มัดจำ</span><span className="num">{baht(order.due_now)}</span></div>
          {order.total > order.due_now && <div className="l"><span>จ่ายที่ร้าน</span><span className="num">{baht(order.total - order.due_now)}</span></div>}
        </div>
      </div>
      {order.status === 'holding' && !expired && (
        <div className="bottombar"><div className="in">
          <input ref={file} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button className="btn red" style={{ flex: 1 }} disabled={busy} onClick={() => file.current?.click()}>
            <span className="ms">upload</span>{busy ? 'กำลังส่ง…' : 'แนบสลิป'}
          </button>
        </div></div>
      )}
    </main>
  );
}

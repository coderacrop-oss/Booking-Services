'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht, thDate } from '@/lib/thaidate';
import type { OrderView } from '@/lib/types';
import { TopBar } from './ui';

type Order = OrderView;

const pad = (n: number) => String(n).padStart(2, '0');
const remain = (o: Order) => Math.round((Number(o.due_now) - Number(o.paid_amount || 0)) * 100) / 100;

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

  // บันทึก QR เป็นรูปเดียวที่มียอด ชื่อบัญชี และรหัสการจอง (ไว้เปิดสแกนในแอปธนาคาร)
  // มือถือ: เปิดเมนูแชร์ → "บันทึกรูปภาพ" · ไม่รองรับ (เช่นในแอป LINE บางรุ่น) = ดาวน์โหลด + บอกให้กดค้างที่รูป
  const [tip, setTip] = useState('');
  const saveQr = async () => {
    const img = new Image();
    img.src = qr;
    await img.decode().catch(() => {});
    const W = 720, H = 980, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const font = getComputedStyle(document.body).fontFamily;
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.fillStyle = '#111'; g.textAlign = 'center';
    g.font = `700 30px ${font}`; g.fillText(shop, W / 2, 70);
    g.font = `800 64px ${font}`; g.fillText(baht(remain(order)), W / 2, 150);
    g.drawImage(img, 80, 190, 560, 560);
    g.font = `400 28px ${font}`; g.fillStyle = '#555';
    if (account) g.fillText(`โอนเข้า ${account}`, W / 2, 810);
    g.fillText(`รหัสการจอง ${order.code}`, W / 2, 860);
    g.font = `400 22px ${font}`; g.fillText('สแกนด้วยแอปธนาคาร แล้วกลับมาแนบสลิป', W / 2, 920);
    const blob: Blob | null = await new Promise((ok) => c.toBlob(ok, 'image/png'));
    if (!blob) return;
    const f = new File([blob], `QR-${order.code}.png`, { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [f] })) { await navigator.share({ files: [f] }); return; }
    } catch (e) { if ((e as Error).name === 'AbortError') return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = f.name; a.click();
    setTip('ถ้ารูปไม่ถูกบันทึก ให้กดค้างที่รูป QR แล้วเลือก "บันทึกรูปภาพ"');
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
              <div className="num" style={{ fontSize: 36, fontWeight: 800 }}>{baht(remain(order))}</div>
              {Number(order.paid_amount) > 0 && <div className="sub">ร้านได้รับแล้ว {baht(Number(order.paid_amount))} · โอนเพิ่มอีก {baht(remain(order))}</div>}
              {left !== null && <div style={{ color: 'var(--red-ink)', fontSize: 14, fontWeight: 700 }}>กันที่ไว้ให้อีก {pad(Math.floor(left / 60))}:{pad(left % 60)} นาที</div>}
              <div style={{ width: 230, height: 230, border: '2px solid var(--ink)', borderRadius: 16, padding: 10, background: '#fff', display: 'grid', placeItems: 'center' }}>
                {qr ? <img src={qr} alt={`QR พร้อมเพย์ ${baht(remain(order))}`} style={{ width: '100%', height: '100%' }} />
                    : <span style={{ color: '#9a9a96', fontSize: 14 }}>ร้านยังไม่ได้ตั้งเลขพร้อมเพย์</span>}
              </div>
              {account && <div className="sub">โอนเข้า {account}</div>}
            </div>
            <ol className="sub" style={{ paddingLeft: 20 }}>
              <li>บันทึกรูป QR หรือสแกนจากแอปธนาคาร</li>
              <li>โอนยอดตามที่แสดง</li>
              <li>กลับมาแนบสลิปที่นี่</li>
            </ol>
            {tip && <div className="warn"><span className="ms">info</span>{tip}</div>}
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
          <button className="btn ghost" disabled={!qr} onClick={saveQr}><span className="ms">download</span>บันทึก QR</button>
          <button className="btn red" style={{ flex: 1 }} disabled={busy} onClick={() => file.current?.click()}>
            <span className="ms">upload</span>{busy ? 'กำลังส่ง…' : 'แนบสลิป'}
          </button>
        </div></div>
      )}
    </main>
  );
}

'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

type S = { code: string; display_name: string; role: string; businesses: string[]; is_groomer: boolean; invite_status: string; linked: boolean; invite_open: boolean };
const ROLE: Record<string, string> = { owner: 'เจ้าของ', manager: 'ผู้จัดการ', staff: 'พนักงาน' };

export default function StaffAdmin({ me, staff, businesses }: { me: string; staff: S[]; businesses: { code: string; name: string }[] }) {
  const router = useRouter();
  const [link, setLink] = useState<{ code: string; url: string } | null>(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ display_name: '', role: 'staff', businesses: [] as string[], is_groomer: false });
  const [confirmRm, setConfirmRm] = useState('');

  const call = async (body: object) => {
    setErr('');
    const r = await fetch('/api/admin/staff', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.message || 'ทำรายการไม่สำเร็จ'); return null; }
    return j;
  };
  const bizName = (c: string) => (c === 'all' ? 'ทุกธุรกิจ' : businesses.find((b) => b.code === c)?.name ?? c);

  return (
    <main className="admin">
      <div className="h1">พนักงาน</div>
      <div className="sub">เชิญด้วยลิงก์ → พนักงานเปิดใน LINE ครั้งเดียว ระบบผูกบัญชีให้ · ลิงก์ใช้ได้ 72 ชั่วโมง ครั้งเดียว</div>
      {err && <div className="err">{err}</div>}
      <table>
        <thead><tr><th>ชื่อ</th><th>บทบาท</th><th>ดูแล</th><th>สถานะ</th><th></th></tr></thead>
        <tbody>
          {staff.map((s) => (
            <tr key={s.code} style={{ opacity: s.invite_status === 'removed' ? 0.45 : 1 }}>
              <td><b>{s.display_name}</b>{s.is_groomer && <span className="sub"> · ช่าง</span>}<br /><span className="sub num">{s.code}</span></td>
              <td>{ROLE[s.role]}</td>
              <td>{s.businesses.map(bizName).join(', ')}</td>
              <td>{s.invite_status === 'removed' ? 'ลบแล้ว' : s.linked ? <span className="ok">ผูก LINE แล้ว</span> : s.invite_open ? 'ส่งลิงก์แล้ว รอเปิด' : 'ยังไม่ได้เชิญ'}</td>
              <td><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button className="btn ghost" style={{ height: 36, padding: '0 14px', fontSize: 14 }}
                  onClick={async () => { const j = await call({ action: 'invite', code: s.code }); if (j) setLink({ code: s.code, url: j.link }); router.refresh(); }}>
                  {s.linked ? 'เชิญใหม่ (เปลี่ยนเครื่อง)' : 'สร้างลิงก์เชิญ'}
                </button>
                {s.code !== me && s.invite_status !== 'removed' && (confirmRm === s.code
                  ? <button className="btn red" style={{ height: 36, padding: '0 14px', fontSize: 14 }} onClick={async () => { await call({ action: 'remove', code: s.code }); setConfirmRm(''); router.refresh(); }}>ยืนยันลบ</button>
                  : <button className="btn ghost" style={{ height: 36, padding: '0 14px', fontSize: 14, color: 'var(--red-ink)', borderColor: '#F0C9CB' }} onClick={() => setConfirmRm(s.code)}>ลบ</button>)}
              </div></td>
            </tr>
          ))}
        </tbody>
      </table>
      {link && (
        <div className="warn" style={{ flexDirection: 'column' }}>
          <b>ลิงก์เชิญ {staff.find((s) => s.code === link.code)?.display_name} (แสดงครั้งเดียว ส่งให้พนักงานทาง LINE)</b>
          <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{link.url}</code>
          <button className="btn" style={{ alignSelf: 'flex-start', height: 36 }} onClick={() => navigator.clipboard?.writeText(link.url)}>คัดลอก</button>
        </div>
      )}
      <div className="section">เพิ่มพนักงาน</div>
      <div className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
        <input placeholder="ชื่อเรียก" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })}
               style={{ height: 40, borderRadius: 10, border: '1.5px solid var(--line)', padding: '0 10px' }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['staff', 'manager', 'owner'].map((r) => <button key={r} className={'chip' + (form.role === r ? ' on' : '')} onClick={() => setForm({ ...form, role: r })}><b>{ROLE[r]}</b></button>)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {businesses.map((b) => (
            <button key={b.code} className={'chip' + (form.businesses.includes(b.code) ? ' on' : '')}
              onClick={() => setForm({ ...form, businesses: form.businesses.includes(b.code) ? form.businesses.filter((x) => x !== b.code) : [...form.businesses, b.code] })}><b>{b.name}</b></button>
          ))}
        </div>
        <label className="sub"><input type="checkbox" checked={form.is_groomer} onChange={(e) => setForm({ ...form, is_groomer: e.target.checked })} /> เป็นช่าง Grooming (ตั้งเวลาทำงานเริ่มต้น อ.–อา. 10:00–19:00 แก้ในไฟล์ตั้งค่าได้)</label>
        <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={async () => { if (await call({ action: 'add', ...form })) { setForm({ display_name: '', role: 'staff', businesses: [], is_groomer: false }); router.refresh(); } }}>เพิ่ม</button>
      </div>
    </main>
  );
}

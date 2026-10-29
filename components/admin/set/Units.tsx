'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { baht } from '@/lib/thaidate';
import { Photo } from '@/components/ui';
import { Switch, useSave } from './util';

type Ph = { id: number; file: string; is_cover: boolean };
type U = { code: string; business_code: string; name: string; summary: string | null; price: number; weekend_price: number | null; max_people: number | null;
  bedrooms: number | null; max_pets: number | null; max_pet_kg: number | null; pet_fee: number | null; rules: string | null; active: boolean; photos: Ph[] };

// ห้อง Pet hotel / หลัง Villa: เปิดปิด · แก้ราคา · รูป
export default function Units({ units, biz, villa }: { units: U[]; biz: string; villa: boolean }) {
  const [open, setOpen] = useState<string | null>(null);
  const { save, Msg } = useSave();
  const blank: U = { code: '', business_code: biz, name: '', summary: '', price: 0, weekend_price: null, max_people: villa ? 4 : null, bedrooms: villa ? 1 : null,
    max_pets: villa ? 0 : 1, max_pet_kg: null, pet_fee: null, rules: '', active: true, photos: [] };
  return (
    <>
      <div className="cap">{units.length} {villa ? 'หลัง' : 'ห้อง'} · เปิดจอง {units.filter((u) => u.active).length}</div>
      <Msg />
      <div className="list">
        {units.map((u) => (
          <div key={u.code} style={{ borderBottom: '1px solid var(--line)' }}>
            <div className="li" style={{ borderBottom: 0, cursor: 'pointer' }} onClick={() => setOpen(open === u.code ? null : u.code)}>
              <Photo file={u.photos.find((p) => p.is_cover)?.file ?? u.photos[0]?.file} h={48} label="" />
              <span className="t"><b>{u.name}</b><small>{[u.summary, `${baht(u.price)}`].filter(Boolean).join(' · ')}</small></span>
              <Switch on={u.active} onChange={(v) => save('unit.active', { code: u.code, active: v }, v ? 'เปิดจองแล้ว' : 'ปิดจองแล้ว')} />
            </div>
            {open === u.code && <UnitForm u={u} villa={villa} onDone={() => setOpen(null)} />}
          </div>
        ))}
        {open === 'new' && <UnitForm u={blank} villa={villa} onDone={() => setOpen(null)} />}
      </div>
      {open !== 'new' && <button className="btnw line" onClick={() => setOpen('new')}>+ เพิ่ม{villa ? 'หลัง' : 'ห้อง'}</button>}
    </>
  );
}

function UnitForm({ u, villa, onDone }: { u: U; villa: boolean; onDone: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ ...u, summary: u.summary ?? '', rules: u.rules ?? '' });
  const file = useRef<HTMLInputElement>(null);
  const [up, setUp] = useState('');
  const { save, busy, Msg } = useSave();
  const set = (k: keyof U) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const n = (k: keyof U, l: string) => <label className="cap" style={{ flex: 1 }}>{l}<input className="input num" inputMode="decimal" value={(f[k] as number | null) ?? ''} onChange={set(k)} /></label>;
  const upload = async (files: FileList | null) => {
    for (const fl of [...(files ?? [])].slice(0, 8)) {
      setUp(`กำลังอัปโหลด ${fl.name}…`);
      const fd = new FormData(); fd.append('owner', u.code); fd.append('file', fl);
      const r = await fetch('/api/admin/photos', { method: 'POST', body: fd });
      if (!r.ok) { setUp((await r.json().catch(() => ({}))).message || 'อัปโหลดไม่สำเร็จ'); return; }
    }
    setUp(''); router.refresh();
  };
  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--soft)' }}>
      <label className="cap">ชื่อ<input className="input" value={f.name} onChange={set('name')} /></label>
      <label className="cap">คำอธิบายสั้น<input className="input" value={f.summary} onChange={set('summary')} placeholder="เช่น 6 ตร.ม. · รับ 1 ตัว" /></label>
      <div style={{ display: 'flex', gap: 8 }}>{n('price', 'ราคา/คืน')}{n('weekend_price', 'ศุกร์–เสาร์')}</div>
      {villa ? (
        <>
          <div style={{ display: 'flex', gap: 8 }}>{n('max_people', 'รับคน')}{n('bedrooms', 'ห้องนอน')}</div>
          <div style={{ display: 'flex', gap: 8 }}>{n('max_pets', 'พาน้องได้ (ตัว)')}{n('pet_fee', 'ค่าน้อง/ตัว/คืน')}</div>
          <label className="cap">กฎบ้าน<textarea className="input" style={{ height: 70, paddingTop: 8 }} value={f.rules} onChange={set('rules')} /></label>
        </>
      ) : <div style={{ display: 'flex', gap: 8 }}>{n('max_pets', 'รับน้อง (ตัว)')}{n('max_pet_kg', 'น้ำหนักสูงสุด (กก.)')}</div>}
      {u.code && (
        <>
          <span className="cap">รูป (กดรูปเพื่อตั้งเป็นปก)</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {u.photos.map((p) => (
              <div key={p.id} style={{ position: 'relative' }}>
                <button onClick={() => save('photo.cover', { id: p.id }, 'ตั้งเป็นรูปปกแล้ว')} style={{ outline: p.is_cover ? '3px solid var(--ink)' : 'none', borderRadius: 12 }}><Photo file={p.file} h={72} label="" /></button>
                <button onClick={() => save('photo.delete', { id: p.id }, 'ลบรูปแล้ว')} style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, background: 'var(--ink)', color: '#fff', fontSize: 14 }}>×</button>
              </div>
            ))}
            <button onClick={() => file.current?.click()} className="photo" style={{ width: 72, height: 72 }}><span className="ms">add_a_photo</span></button>
            <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          </div>
          {up && <div className="cap">{up}</div>}
        </>
      )}
      <Msg />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btnw dark" disabled={busy} onClick={async () => { if (await save('unit.save', f)) onDone(); }}>{busy ? 'กำลังบันทึก…' : u.code ? 'บันทึก' : 'เพิ่ม'}</button>
        <button className="btnw line" onClick={onDone}>ปิด</button>
      </div>
      {!u.code && <div className="cap">เพิ่มแล้วจึงอัปโหลดรูปได้</div>}
    </div>
  );
}

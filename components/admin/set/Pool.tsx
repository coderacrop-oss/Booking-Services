'use client';
import { useState } from 'react';
import { Stepper } from '@/components/ui';
import { DayPick, Switch, useSave } from './util';

type R = { code: string; unit_code: string; weekdays: number[]; start_time: string; end_time: string; size_rule: string; capacity: number; price: number; active: boolean; booked: number };
const SIZE = [['small', 'เล็ก ≤10'], ['large', 'ใหญ่ 10+'], ['all', 'ทุกขนาด']];

// รอบสระ: เวลา · ขนาดน้อง · จำนวนที่รับ · ราคา · วันที่เปิด
export default function Pool({ rounds, unit }: { rounds: R[]; unit: string }) {
  const [list, setList] = useState(rounds);
  const { save, busy, Msg } = useSave();
  const upd = (i: number, p: Partial<R>) => setList(list.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const add = () => setList([...list, { code: '', unit_code: unit, weekdays: [1, 2, 3, 4, 5, 6, 7], start_time: '16:00', end_time: '17:00', size_rule: 'all', capacity: 10, price: list[0]?.price ?? 240, active: true, booked: 0 }]);
  return (
    <>
      <div className="note y">แก้เวลา ขนาดน้อง จำนวนที่รับ หรือเพิ่ม/ลบรอบ · ลูกค้าเห็นทันที</div>
      <Msg />
      {list.map((r, i) => (
        <div key={r.code || 'new' + i} className="card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <b>{r.start_time}–{r.end_time}{r.booked ? <span className="cap"> · จองแล้ว {r.booked}</span> : ''}</b>
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span className="cap">เปิดรับจอง</span><Switch on={r.active} onChange={(v) => upd(i, { active: v })} /></span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <label className="cap" style={{ flex: 1 }}>เริ่ม<input className="input" type="time" value={r.start_time} onChange={(e) => upd(i, { start_time: e.target.value })} /></label>
            <label className="cap" style={{ flex: 1 }}>จบ<input className="input" type="time" value={r.end_time} onChange={(e) => upd(i, { end_time: e.target.value })} /></label>
          </div>
          <span className="cap">ขนาดน้อง</span>
          <div className="segbox">{SIZE.map(([k, l]) => <button key={k} className={r.size_rule === k ? 'on' : ''} onClick={() => upd(i, { size_rule: k })}>{l}</button>)}</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b>จำนวนที่รับ</b><Stepper value={r.capacity} min={1} max={200} onChange={(n) => upd(i, { capacity: n })} /></div>
          <label className="cap">ราคาต่อตัว (บาท)<input className="input num" inputMode="decimal" value={r.price} onChange={(e) => upd(i, { price: Number(e.target.value) || 0 })} /></label>
          <span className="cap">วันที่เปิด</span>
          <DayPick value={r.weekdays} onChange={(v) => upd(i, { weekdays: v })} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btnw dark" disabled={busy} onClick={async () => { const j = await save('session.save', r); if (j?.code) upd(i, { code: j.code }); }}>บันทึก</button>
            {r.code && <button className="btnw danger" style={{ flex: 0.6 }} onClick={() => save('session.delete', { code: r.code }, 'ปิดรอบนี้แล้ว')}>ลบรอบ</button>}
          </div>
        </div>
      ))}
      <button className="btnw line" onClick={add}>+ เพิ่มรอบ</button>
    </>
  );
}

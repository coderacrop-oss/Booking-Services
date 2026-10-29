'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { BizCatalog, CartItem, Pet, Quote } from '@/lib/types';
import { addDays, baht, isoDow, thDate, thDay, thRange } from '@/lib/thaidate';
import { BottomBar, Chip, Photo, Progress, Stepper, Tick, TopBar } from './ui';
import { clearTrip, loadTrip, saveTrip, type TripEntry } from '@/lib/trip';
import { bizLook } from '@/lib/look';

type StepKey = 'dates' | 'guests' | 'pets' | 'pet' | 'unit' | 'session' | 'service' | 'addons' | 'slot' | 'summary';
type Avail<T> = { loading: boolean; error: string | null; data: T | null };
type UnitAv = { code: string; free: boolean; reason: string | null };
type SessAv = { code: string; start: string; end: string; size_rule: string; left: number; capacity: number; free: boolean; reason: string | null };
type SlotAv = { minutes: number; closed: boolean; slots: { start: string; staff: string; staff_name: string }[] };

const SIZE_TH: Record<string, string> = { small: 'น้องเล็ก ≤ 10 กก.', large: 'น้องใหญ่ 10 กก.+', all: 'ทุกขนาด' };

// ดึงข้อมูลจาก API ตาม key (เปลี่ยน key = โหลดใหม่)
function useFetch<T>(url: string | null, body?: unknown): Avail<T> {
  const [st, setSt] = useState<Avail<T>>({ loading: false, error: null, data: null });
  const key = url ? url + JSON.stringify(body ?? null) : null;
  useEffect(() => {
    if (!url) { setSt({ loading: false, error: null, data: null }); return; }
    let live = true;
    setSt({ loading: true, error: null, data: null });
    fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.message || 'โหลดไม่สำเร็จ'); return j as T; })
      .then((d) => live && setSt({ loading: false, error: null, data: d }))
      .catch((e: Error) => live && setSt({ loading: false, error: e.message, data: null }));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return st;
}

export default function BookingFlow({ cat, pets, loggedIn, today, initial }:
  { cat: BizCatalog; pets: Pet[]; loggedIn: boolean; today: string; initial?: { date?: string; service?: string } }) {
  const router = useRouter();
  const b = cat.business;
  const forPeople = cat.units.some((u) => u.max_people);              // Villa = ที่พักคน
  const petsAllowed = cat.units.some((u) => (u.max_pets ?? 0) > 0);
  const mains = cat.services.filter((s) => s.kind === 'main');
  const addonList = cat.services.filter((s) => s.kind === 'addon');

  const steps: StepKey[] = b.booking_type === 'stay'
    ? (forPeople ? ['dates', 'guests', 'unit', 'summary'] : ['dates', 'pets', 'unit', 'summary'])
    : b.booking_type === 'session' ? ['pets', 'session', 'summary']
    : ['pet', 'service', 'addons', 'slot', 'summary'];

  const [i, setI] = useState(0);
  const step = steps[i];
  const start = initial?.date && /^\d{4}-\d{2}-\d{2}$/.test(initial.date) && initial.date >= today ? initial.date : today;
  const [from, setFrom] = useState(start);
  const [nights, setNights] = useState(1);
  const to = addDays(from, nights);
  const [guests, setGuests] = useState(2);
  const [sel, setSel] = useState<string[]>([]);            // น้องที่เลือก
  const [unit, setUnit] = useState<string | null>(null);
  const [date, setDate] = useState(start);
  const [session, setSession] = useState<string | null>(null);
  const [service, setService] = useState<string | null>(initial?.service && mains.some((m) => m.code === initial.service) ? initial.service : null);
  const [addons, setAddons] = useState<string[]>([]);
  const [slot, setSlot] = useState<{ start: string; staff: string; staff_name: string } | null>(null);
  const [toast] = useState('');
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [orderErr, setOrderErr] = useState('');
  const [trip, setTrip] = useState<TripEntry[]>([]);
  useEffect(() => setTrip(loadTrip()), []);

  const chosenPets = pets.filter((p) => sel.includes(p.code));
  const pet = chosenPets[0] ?? null;
  const vaxOk = (p: Pet, on: string) => !b.need_vaccine || (!!p.vaccine_until && p.vaccine_until >= on);
  const serviceDate = b.booking_type === 'stay' ? from : date;
  const days = useMemo(() => Array.from({ length: 14 }, (_, k) => addDays(today, k)), [today]);
  const closedOn = (d: string, unitCode?: string | null) =>
    cat.closures.some((c) => d >= c.date_from && d <= c.date_to && !c.session_code && (!c.unit_code || c.unit_code === unitCode));

  // ---------- ที่ว่างจาก server ----------
  const maxKg = chosenPets.length ? Math.max(...chosenPets.map((p) => Number(p.weight_kg))) : 0;
  const unitAv = useFetch<{ units: UnitAv[] }>(step === 'unit'
    ? `/api/availability?type=stay&biz=${b.code}&from=${from}&to=${to}&pets=${sel.length}${forPeople ? `&guests=${guests}` : ''}${maxKg ? `&maxkg=${maxKg}` : ''}`
    : null);
  const sessAv = useFetch<{ sessions: SessAv[] }>(step === 'session'
    ? `/api/availability?type=session&biz=${b.code}&date=${date}&kg=${chosenPets.map((p) => p.weight_kg).join(',')}` : null);
  const slotAv = useFetch<SlotAv>(step === 'slot' && service
    ? `/api/availability?type=slot&biz=${b.code}&date=${date}&service=${service}&addons=${addons.join(',')}&tier=${pet?.tier_code ?? ''}` : null);

  const cart: CartItem | null = useMemo(() => {
    if (b.booking_type === 'stay' && unit) return { business: b.code, kind: 'stay', unit, from, to, pets: sel, guests: forPeople ? guests : undefined };
    if (b.booking_type === 'session' && session) return { business: b.code, kind: 'session', session, date, pets: sel };
    if (b.booking_type === 'slot' && service && slot && pet) return { business: b.code, kind: 'slot', service, addons, staff: slot.staff, start: `${date}T${slot.start}`, pet: pet.code };
    return null;
  }, [b, unit, from, to, sel, guests, forPeople, session, date, service, slot, pet, addons]);
  const allItems = cart ? [...trip.map((t) => t.item), cart] : [];
  const q = useFetch<Quote>(step === 'summary' && cart ? '/api/quote' : null, cart ? { items: allItems } : undefined);

  // ---------- ราคาประมาณ (ระหว่างเลือก) ----------
  const estimate = (() => {
    if (b.booking_type === 'stay') {
      const u = cat.units.find((x) => x.code === unit) ?? null;
      const base = u ? Number(u.price) : Math.min(...cat.units.map((x) => Number(x.price)));
      const fee = u?.pet_fee ? Number(u.pet_fee) * sel.length : 0;
      return (base + fee) * nights;
    }
    if (b.booking_type === 'session') {
      const s = cat.sessions.find((x) => x.code === session) ?? cat.sessions[0];
      return s ? Number(s.price) * Math.max(1, sel.length) : 0;
    }
    const s = mains.find((x) => x.code === service);
    const main = !s ? 0 : s.price_mode === 'flat' ? Number(s.price) : Number(s.prices.find((p) => p.tier_code === pet?.tier_code)?.price ?? s.prices[0]?.price ?? 0);
    return main + addonList.filter((a) => addons.includes(a.code)).reduce((t, a) => t + Number(a.price), 0);
  })();

  const note = (() => {
    if (b.booking_type === 'stay') return `${thRange(from, to)} · ${nights} คืน${sel.length ? ` · น้อง ${sel.length}` : ''}`;
    if (b.booking_type === 'session') return `${thDate(date)}${sel.length ? ` · ${sel.length} ตัว` : ''}`;
    return `${thDate(date)}${slot ? ' · ' + slot.start : ''}`;
  })();

  const valid: Record<StepKey, boolean> = {
    dates: nights >= 1 && !closedOn(from),
    guests: guests >= 1,
    pets: b.booking_type === 'stay' ? sel.length > 0 : sel.length > 0,
    pet: sel.length === 1,
    unit: !!unit && !!unitAv.data?.units.find((u) => u.code === unit)?.free,
    session: !!session,
    service: !!service,
    addons: true,
    slot: !!slot,
    summary: !!q.data && accept,
  };

  const go = (d: number) => {
    const n = i + d;
    if (n < 0) return router.push('/');
    setI(Math.min(n, steps.length - 1));
    window.scrollTo(0, 0);
  };
  // ขายข้ามธุรกิจ: เก็บรายการนี้ไว้ในทริป แล้วไปเลือกบริการถัดไป (จ่ายรวม QR เดียว)
  const offerDate = (rule: string) => b.booking_type !== 'stay' ? date
    : rule === 'checkout_day' ? to : nights > 1 ? addDays(from, 1) : from;
  const addOffer = (x: BizCatalog['cross_sells'][number]) => {
    if (!cart || !q.data) return;
    const qi = q.data.items[q.data.items.length - 1];
    saveTrip([...trip, { item: cart, title: qi.title, when: qi.when, business_name: b.name }]);
    const svc = x.offer_item ? `&service=${encodeURIComponent(x.offer_item)}` : '';
    router.push(`/b/${x.offer_business}?trip=1&date=${offerDate(x.when_rule)}${svc}`);
  };
  const removeTrip = (k: number) => { const t = trip.filter((_, j) => j !== k); setTrip(t); saveTrip(t); };
  const offers = cat.cross_sells.filter((x) => !/น้อง/.test(x.condition || '') || sel.length > 0);

  // สร้างการจองจริง → ไปหน้าจ่าย
  const placeOrder = async () => {
    if (!cart) return;
    setBusy(true); setOrderErr('');
    const r = await fetch('/api/orders', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: allItems, accept }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setOrderErr(j.message || 'จองไม่สำเร็จ'); return; }
    clearTrip();
    router.push(j.paid ? `/me?done=${j.order}` : `/pay/${j.order}`);
  };
  const toggle = (code: string, single = false) => {
    setSel((s) => (single ? [code] : s.includes(code) ? s.filter((x) => x !== code) : [...s, code]));
    setUnit(null); setSession(null); setSlot(null);
  };

  // ---------- เนื้อหาแต่ละขั้น ----------
  const petCards = (single: boolean) => (
    <>
      {!loggedIn && <div className="warn"><span className="ms">info</span>เปิดหน้านี้ผ่าน LINE ของร้านเพื่อเลือกน้องและจอง</div>}
      {loggedIn && !pets.length && <div className="warn"><span className="ms">info</span>ยังไม่มีข้อมูลน้องในบัญชีนี้</div>}
      {loggedIn && (
        <a className="btn ghost" style={{ alignSelf: 'flex-start', height: 40 }} href={`/me/pets?back=/b/${b.code}`}>
          <span className="ms">{b.need_vaccine ? 'vaccines' : 'add'}</span>{b.need_vaccine ? 'เพิ่มน้อง / ส่งรูปวัคซีน' : 'เพิ่มน้อง'}
        </a>
      )}
      {pets.map((p) => {
        const ok = vaxOk(p, serviceDate);
        return (
          <button key={p.code} className={'card' + (sel.includes(p.code) ? ' on' : '')} disabled={!ok} onClick={() => toggle(p.code, single)}>
            <Photo h={44} label="" />
            <span className="t">
              <b>{p.name}</b>
              <small>{[p.breed, `${p.weight_kg} กก.`].filter(Boolean).join(' · ')}</small>
              {b.need_vaccine && (ok
                ? <small className="ok">วัคซีนผ่านตรวจ ใช้ได้ถึง {thDay(p.vaccine_until!)}</small>
                : <small style={{ color: 'var(--red-ink)' }}>{p.vaccine_pending ? 'วัคซีนรอร้านตรวจ' : 'ยังไม่มีวัคซีนที่ผ่านตรวจ'}</small>)}
            </span>
            <Tick on={sel.includes(p.code)} />
          </button>
        );
      })}
    </>
  );

  let content: React.ReactNode = null;
  if (step === 'dates') content = (
    <>
      <div className="h1">{forPeople ? 'เข้าพักวันไหน' : 'ฝากวันไหน'}</div>
      <div className="sub">เช็กอิน {b.checkin_time || '14:00'} · เช็กเอาต์ {b.checkout_time || '12:00'}</div>
      <div className="chips">
        {days.map((d, k) => <Chip key={d} on={from === d} disabled={closedOn(d)} title={thDate(d, false)} sub={k === 0 ? 'วันนี้' : k === 1 ? 'พรุ่งนี้' : thDate(d).split(' ')[2]} onClick={() => { setFrom(d); setUnit(null); }} />)}
      </div>
      <label className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        วันอื่น <input type="date" min={today} value={from} onChange={(e) => e.target.value && (setFrom(e.target.value), setUnit(null))} />
      </label>
      <div className="section">{forPeople ? 'วันออก' : 'รับกลับวันไหน'}</div>
      <div className="grid2">
        {[1, 2, 3, 4, 5, 6, 7].map((n) => <Chip key={n} on={nights === n} title={thDate(addDays(from, n), false)} sub={`${n} คืน`} onClick={() => { setNights(n); setUnit(null); }} />)}
      </div>
      {closedOn(from) && <div className="err">วันที่เลือกร้านปิด</div>}
    </>
  );
  if (step === 'guests') content = (
    <>
      <div className="h1">ผู้เข้าพัก</div>
      <div className="card" style={{ justifyContent: 'space-between' }}>
        <span className="t"><b>จำนวนคน</b><small>รวมเด็ก</small></span>
        <Stepper value={guests} min={1} max={Math.max(...cat.units.map((u) => u.max_people ?? 1))} onChange={(n) => { setGuests(n); setUnit(null); }} />
      </div>
      {petsAllowed && <><div className="section">พาน้องมาด้วยไหม</div><div className="sub">เลือกได้ไม่บังคับ · คิดค่าน้องต่อตัวต่อคืน</div>{petCards(false)}</>}
    </>
  );
  if (step === 'pets') content = (
    <><div className="h1">น้องที่มา{b.booking_type === 'stay' ? 'พัก' : 'ว่ายน้ำ'}</div>
      {b.need_vaccine && <div className="sub">ต้องมีวัคซีนที่ร้านตรวจแล้ว และยังไม่หมดอายุ</div>}
      {petCards(false)}</>
  );
  if (step === 'pet') content = <><div className="h1">น้องตัวไหน</div>{petCards(true)}</>;
  if (step === 'unit') content = (
    <>
      <div className="h1">{forPeople ? 'เลือกบ้าน' : 'เลือกห้อง'}</div>
      <div className="sub">{thRange(from, to)} · {nights} คืน</div>
      {unitAv.loading && <><div className="skeleton" style={{ height: 220 }} /><div className="skeleton" style={{ height: 220 }} /></>}
      {unitAv.error && <div className="err">{unitAv.error}</div>}
      {unitAv.data && cat.units.map((u) => {
        const av = unitAv.data!.units.find((x) => x.code === u.code);
        return (
          <button key={u.code} className={'unit' + (unit === u.code ? ' on' : '')} disabled={!av?.free} onClick={() => setUnit(u.code)}>
            <Photo file={u.photos[0]?.file} />
            <div className="row">
              <span className="t">
                <b>{u.name}</b>
                <small>{u.summary}</small>
                {!av?.free && <small style={{ color: 'var(--red-ink)' }}>{av?.reason}</small>}
                {u.pet_fee && sel.length > 0 ? <small>ค่าน้อง {baht(Number(u.pet_fee))}/ตัว/คืน</small> : null}
              </span>
              <span className="p num">{baht(Number(u.price))}<small>/คืน</small></span>
            </div>
          </button>
        );
      })}
    </>
  );
  if (step === 'session') {
    const open = cat.sessions.filter((s) => s.weekdays.includes(isoDow(date)));
    content = (
      <>
        <div className="h1">เลือกวันและรอบ</div>
        <div className="chips">
          {days.map((d, k) => <Chip key={d} on={date === d} title={thDate(d, false)} sub={k === 0 ? 'วันนี้' : k === 1 ? 'พรุ่งนี้' : thDate(d).split(' ')[2]} onClick={() => { setDate(d); setSession(null); }} />)}
        </div>
        <label className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          วันอื่น <input type="date" min={today} value={date} onChange={(e) => e.target.value && (setDate(e.target.value), setSession(null))} />
        </label>
        {sessAv.loading && <div className="skeleton" />}
        {sessAv.error && <div className="err">{sessAv.error}</div>}
        {sessAv.data && !open.length && <div className="warn"><span className="ms">info</span>วันนี้ไม่มีรอบ</div>}
        {sessAv.data?.sessions.map((s) => (
          <button key={s.code} className={'card' + (session === s.code ? ' on' : '')} disabled={!s.free} onClick={() => setSession(s.code)}>
            <span className="t"><b className="num">{s.start}–{s.end}</b><small>{SIZE_TH[s.size_rule]}</small></span>
            <span className="p num" style={{ fontSize: 14 }}>{s.free ? `เหลือ ${s.left} ที่` : s.reason}</span>
          </button>
        ))}
      </>
    );
  }
  if (step === 'service') content = (
    <>
      <div className="h1">บริการหลัก</div>
      <div className="sub">ราคาตามขนาดของ{pet?.name ?? 'น้อง'}</div>
      {mains.map((s) => {
        const p = s.price_mode === 'flat' ? s : s.prices.find((x) => x.tier_code === pet?.tier_code);
        const tier = cat.tiers.find((t) => t.code === pet?.tier_code);
        return (
          <button key={s.code} className={'card' + (service === s.code ? ' on' : '')} disabled={!p} onClick={() => { setService(s.code); setSlot(null); }}>
            <span className="t"><b>{s.name}</b><small>{[s.description, p?.duration_min ? `${p.duration_min} นาที` : ''].filter(Boolean).join(' · ')}</small></span>
            <span className="p num">{p ? baht(Number(p.price)) : '-'}<small>{s.price_mode === 'by_weight' ? tier?.label : ''}</small></span>
          </button>
        );
      })}
    </>
  );
  if (step === 'addons') content = (
    <>
      <div className="h1">เพิ่มบริการเสริม</div>
      <div className="sub">ไม่เลือกก็ได้</div>
      {addonList.map((a) => (
        <button key={a.code} className={'card' + (addons.includes(a.code) ? ' on' : '')} onClick={() => { setAddons((x) => x.includes(a.code) ? x.filter((y) => y !== a.code) : [...x, a.code]); setSlot(null); }}>
          <span className="t"><b>{a.name}</b></span>
          <span className="p num">{baht(Number(a.price))}</span>
          <Tick on={addons.includes(a.code)} />
        </button>
      ))}
    </>
  );
  if (step === 'slot') content = (
    <>
      <div className="h1">เวลา · {thDate(date)}</div>
      <div className="chips">
        {days.map((d, k) => <Chip key={d} on={date === d} title={thDate(d, false)} sub={k === 0 ? 'วันนี้' : k === 1 ? 'พรุ่งนี้' : thDate(d).split(' ')[2]} onClick={() => { setDate(d); setSlot(null); }} />)}
      </div>
      <label className="sub" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        วันอื่น <input type="date" min={today} value={date} onChange={(e) => e.target.value && (setDate(e.target.value), setSlot(null))} />
      </label>
      {slotAv.loading && <div className="skeleton" />}
      {slotAv.error && <div className="err">{slotAv.error}</div>}
      {slotAv.data && <div className="sub">ใช้เวลาประมาณ {slotAv.data.minutes} นาที</div>}
      {slotAv.data && (slotAv.data.closed || !slotAv.data.slots.length) && <div className="warn"><span className="ms">info</span>{slotAv.data.closed ? 'ร้านปิดวันนี้' : 'วันนี้คิวเต็ม ลองวันอื่น'}</div>}
      <div className="grid2">
        {slotAv.data?.slots.map((s) => <Chip key={s.start} on={slot?.start === s.start} title={s.start} sub={'พี่' + s.staff_name} onClick={() => setSlot(s)} />)}
      </div>
    </>
  );
  if (step === 'summary') content = (
    <>
      {q.loading && <><div className="skeleton" /><div className="skeleton" style={{ height: 140 }} /></>}
      {q.error && <div className="err">{q.error}</div>}
      {q.data?.items.map((it, k) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div className="h1" style={{ fontSize: 20 }}>{it.title}</div>
          <div className="sub">{it.when}</div>
        </div>
      ))}
      {q.data && (
        <div className="bill">
          {q.data.items.flatMap((it) => it.lines).map((l, k) => <div key={k} className="l"><span>{l.label}{l.note ? ` (${l.note})` : ''}</span><span className="num">{baht(l.amount)}</span></div>)}
          <hr />
          <div className="l tot"><span>รวม</span><span className="num">{baht(q.data.total)}</span></div>
          <div className="l"><span>จ่ายตอนจอง</span><span className="num">{baht(q.data.due_now)}</span></div>
          {q.data.pay_later > 0 && <div className="l"><span>จ่ายที่ร้าน</span><span className="num">{baht(q.data.pay_later)}</span></div>}
        </div>
      )}
      {trip.length > 0 && (
        <>
          <div className="section">รายการก่อนหน้าในทริปนี้</div>
          {trip.map((t, k) => (
            <div key={k} className="card" style={{ padding: 10 }}>
              <span className="t"><b style={{ fontSize: 14 }}>{t.business_name} · {t.title}</b><small>{t.when}</small></span>
              <button className="sub" onClick={() => removeTrip(k)}>เอาออก</button>
            </div>
          ))}
        </>
      )}
      {q.data && loggedIn && trip.length < 6 && offers.length > 0 && (
        <>
          <div className="section">เพิ่มให้ทริปนี้ · จ่ายรวม QR เดียว</div>
          {offers.map((x) => {
            const L = bizLook(x.offer_business, x.offer_color, x.offer_type);
            return (
              <div key={x.offer_business + x.title} className="card" style={{ padding: 12 }}>
                <span className="t">
                  <span className="tag" style={{ background: L.bg, color: L.fg, alignSelf: 'flex-start' }}><span className="ms" style={{ fontSize: 15 }}>{L.icon}</span>{x.offer_name}</span>
                  <b style={{ fontSize: 15 }}>{x.title}</b>
                  <small>{thDate(offerDate(x.when_rule))}{x.condition ? ' · ' + x.condition : ''}</small>
                </span>
                <button className="btn ghost" style={{ height: 36, padding: '0 14px', fontSize: 14 }} onClick={() => addOffer(x)}>+ เพิ่ม</button>
              </div>
            );
          })}
        </>
      )}
      <div className="section">เงื่อนไขการจองและยกเลิก</div>
      <div className="sub" style={{ fontSize: 13 }}>{b.cancel_policy}</div>
      <div className="sub" style={{ fontSize: 13 }}>หลังกดชำระเงิน ร้านกันที่ไว้ {cat.hold_minutes} นาที แนบสลิปไม่ทันระบบจะปล่อยที่ให้คนอื่น</div>
      <button className={'card' + (accept ? ' on' : '')} onClick={() => setAccept(!accept)}>
        <span className="t"><b style={{ fontSize: 15 }}>อ่านและยอมรับเงื่อนไขแล้ว</b></span><Tick on={accept} />
      </button>
      {orderErr && <div className="err">{orderErr}</div>}
    </>
  );

  const last = step === 'summary';
  return (
    <main className="app">
      <TopBar title={`จอง ${b.name}`} step={`ขั้น ${i + 1}/${steps.length}`} onBack={() => go(-1)} />
      <Progress n={steps.length} at={i} />
      <div className="body">
        {trip.length > 0 && step !== 'summary' && <div className="warn"><span className="ms">info</span>ทริปนี้มี {trip.length} รายการก่อนหน้า · จ่ายรวม QR เดียวตอนสรุป</div>}
        {content}
      </div>
      <BottomBar
        note={last ? 'จ่ายวันนี้' : note}
        amount={baht(last && q.data ? q.data.due_now : estimate)}
        label={last ? 'ชำระเงิน' : step === 'addons' && !addons.length ? 'ข้าม' : 'ต่อไป'}
        red={last}
        disabled={!valid[step]}
        busy={busy}
        onClick={() => (last ? placeOrder() : go(1))}
      />
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}

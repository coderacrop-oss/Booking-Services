// ตะกร้าทริป (หลายธุรกิจ จ่าย QR เดียว) · เก็บใน sessionStorage ของแท็บนี้เท่านั้น
import type { CartItem } from './types';

export interface TripEntry { item: CartItem; title: string; when: string; business_name: string }
const KEY = 'bs_trip';

export function loadTrip(): TripEntry[] {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || '[]'); return Array.isArray(v) ? v.slice(0, 7) : []; } catch { return []; }
}
export function saveTrip(t: TripEntry[]) {
  try { sessionStorage.setItem(KEY, JSON.stringify(t.slice(0, 7))); } catch { /* ไม่มี storage ก็จองรายการเดียวได้ */ }
}
export function clearTrip() { try { sessionStorage.removeItem(KEY); } catch { /* */ } }

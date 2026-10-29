// ป้ายสถานะ (ข้อความ · พื้น · ตัวอักษร)
export const ORDER_ST: Record<string, [string, string, string]> = {
  holding: ['รอโอน', '#FDF5DC', '#8A5A00'], pending_review: ['รอร้านตรวจสลิป', '#FDF5DC', '#8A5A00'],
  paid: ['ยืนยันแล้ว', '#E4F3EA', '#1E7B4A'], cancelled: ['ยกเลิก', '#FBE3E4', '#B8262E'], expired: ['หมดเวลา', '#F4F4F1', '#9A9A96'],
};
export const BOOK_ST: Record<string, [string, string, string]> = {
  holding: ['รอยืนยัน', '#FDF5DC', '#8A5A00'], confirmed: ['ยืนยันแล้ว', '#E4F3EA', '#1E7B4A'],
  checked_in: ['เข้าพักแล้ว', '#E4F3EA', '#1E7B4A'], in_progress: ['กำลังทำ', '#E3EEFB', '#1F5FA8'],
  done: ['เสร็จแล้ว', '#F4F4F1', '#555'], cancelled: ['ยกเลิก', '#FBE3E4', '#B8262E'],
  no_show: ['ไม่มา', '#FBE3E4', '#B8262E'], expired: ['หมดเวลา', '#F4F4F1', '#9A9A96'],
};
export function Pill({ s }: { s: [string, string, string] }) {
  return <span className="pill" style={{ background: s[1], color: s[2] }}>{s[0]}</span>;
}

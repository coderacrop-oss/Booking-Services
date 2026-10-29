// สถานะวัคซีนรวมของน้อง (ข้อความ · พื้น · ตัวอักษร)
export function vaxState(v: { status: string; expires_on: string }[], today: string): [string, string, string] {
  if (v.some((x) => x.status === 'approved' && x.expires_on >= today)) return ['วัคซีนครบ · ร้านตรวจแล้ว', 'var(--green-soft)', 'var(--green)'];
  if (v.some((x) => x.status === 'pending')) return ['วัคซีนรอร้านตรวจ', 'var(--amber-soft)', 'var(--amber)'];
  return ['ยังไม่มีวัคซีน', '#FBE3E4', 'var(--red-ink)'];
}

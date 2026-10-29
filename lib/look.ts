// สีและไอคอนของแต่ละธุรกิจ (สีมาจาก businesses.color)
export function bizLook(code: string, color: string | null, type: string) {
  const bg = color || '#111111';
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const icon = { pet_hotel: 'bed', villa: 'cottage', pool: 'pool', grooming: 'content_cut' }[code]
    || { stay: 'bed', session: 'event', slot: 'schedule' }[type] || 'event';
  return { bg, fg: lum > 0.55 ? '#111' : '#fff', icon };
}

// path รูปใน bucket photos หรือ URL เต็ม
export function photoUrl(file: string | null | undefined): string | null {
  if (!file) return null;
  if (/^https?:\/\//.test(file)) return file;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/photos/${encodeURIComponent(file)}` : null;
}

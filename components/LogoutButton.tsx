'use client';
export default function LogoutButton() {
  return <button className="pbtn" style={{ background: 'var(--soft)', color: 'var(--red-ink)' }} onClick={async () => { await fetch('/api/staff/logout', { method: 'POST' }); location.href = '/admin'; }}>ออก</button>;
}

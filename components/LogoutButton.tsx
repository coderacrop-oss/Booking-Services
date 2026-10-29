'use client';
export default function LogoutButton() {
  return <button className="sub" onClick={async () => { await fetch('/api/staff/logout', { method: 'POST' }); location.href = '/admin'; }}>ออก</button>;
}

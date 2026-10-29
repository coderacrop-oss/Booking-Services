'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// เปิดใน LINE: ล็อกอินด้วย LIFF แล้วส่ง ID token ให้ server ตรวจ (server ตั้งคุกกี้)
// ไม่ได้ตั้ง NEXT_PUBLIC_LIFF_ID (เครื่อง dev/เดโม่) = ข้าม
export default function LiffGate({ loggedIn, children }: { loggedIn: boolean; children: React.ReactNode }) {
  const router = useRouter();
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const [err, setErr] = useState('');
  const need = !!liffId && !loggedIn;

  useEffect(() => {
    if (!need) return;
    (async () => {
      try {
        const liff = (await import('@line/liff')).default;
        await liff.init({ liffId: liffId! });
        if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error('no token');
        const r = await fetch('/api/auth/line', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idToken }) });
        if (!r.ok) throw new Error((await r.json()).message);
        router.refresh();
      } catch (e) {
        setErr((e as Error).message || 'เข้าสู่ระบบไม่สำเร็จ');
      }
    })();
  }, [need, liffId, router]);

  if (!need) return <>{children}</>;
  return (
    <main className="app"><div className="body" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      {err ? <><div className="err">{err}</div><button className="btn" onClick={() => location.reload()}>ลองใหม่</button></>
           : <div className="sub">กำลังเข้าสู่ระบบด้วย LINE…</div>}
    </div></main>
  );
}

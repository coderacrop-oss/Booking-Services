import { liffId } from '@/lib/config';
import LiffGateClient from './LiffGateClient';

// อ่าน LIFF ID ฝั่ง server แล้วส่งให้ตัวล็อกอิน (เปลี่ยน LIFF ID ในหลังบ้านได้โดยไม่ต้อง deploy ใหม่)
export default async function LiffGate({ loggedIn, children }: { loggedIn: boolean; children: React.ReactNode }) {
  return <LiffGateClient liffId={await liffId()} loggedIn={loggedIn}>{children}</LiffGateClient>;
}

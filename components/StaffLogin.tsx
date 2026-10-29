import { liffId } from '@/lib/config';
import StaffLoginClient from './StaffLoginClient';

export default async function StaffLogin({ mode, token }: { mode: 'join' | 'login'; token?: string }) {
  return <StaffLoginClient liffId={await liffId()} mode={mode} token={token} />;
}

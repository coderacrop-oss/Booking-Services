import StaffLogin from '@/components/StaffLogin';

export const dynamic = 'force-dynamic';

// ลิงก์เชิญพนักงาน: /staff/join?t=<รหัสเชิญ>
export default async function Join({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <StaffLogin mode="join" token={t} />;
}

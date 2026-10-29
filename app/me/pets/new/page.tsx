import { CustScreen, requireCustomer } from '@/components/cust/Gate';
import PetForm from '@/components/cust/PetForm';

export const dynamic = 'force-dynamic';

export default async function NewPet({ searchParams }: { searchParams: Promise<{ back?: string }> }) {
  const g = await requireCustomer();
  if ('node' in g) return g.node;
  const { back } = await searchParams;
  return <CustScreen tabs={false}><PetForm back={back && back.startsWith('/b/') ? back : null} /></CustScreen>;
}

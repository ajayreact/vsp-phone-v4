import { redirect } from 'next/navigation';

/** Platform number search & purchase — tab deep-link into Telnyx Mission Control. */
export default function NumberMarketplacePage() {
  redirect('/telnyx-numbers?tab=search');
}

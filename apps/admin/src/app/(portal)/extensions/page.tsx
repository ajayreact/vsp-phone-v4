import { Suspense } from 'react';
import { ExtensionsHubContent } from '../../../components/modules/extensions/ExtensionsHubContent';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading extensions…</div>}>
      <ExtensionsHubContent />
    </Suspense>
  );
}

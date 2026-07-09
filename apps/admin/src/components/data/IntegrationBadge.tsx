import type { ApiIntegrationStatus } from '../../types/navigation';
import { Badge } from '../ui/Badge';

const LABELS: Record<ApiIntegrationStatus, string> = {
  live: 'API Live',
  bff: 'BFF Proxy',
  planned: 'API Planned',
};

const TONES: Record<ApiIntegrationStatus, 'success' | 'primary' | 'warning'> = {
  live: 'success',
  bff: 'primary',
  planned: 'warning',
};

export function IntegrationBadge({ status }: { status: ApiIntegrationStatus }) {
  return <Badge variant={TONES[status]}>{LABELS[status]}</Badge>;
}

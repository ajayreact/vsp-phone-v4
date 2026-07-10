import type { NavGroup } from '../../types/navigation';

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  operations: 'Operations Center',
  carrier: 'Carrier & Numbers',
  platform: 'Platform',
  telephony: 'PBX',
  routing: 'Call Routing',
  analytics: 'Analytics',
  billing: 'Billing',
  infrastructure: 'Infrastructure',
  security: 'Security',
  system: 'System',
};

/** Nav group display order — carrier inventory first for platform operators. */
export const NAV_GROUP_ORDER: NavGroup[] = [
  'operations',
  'carrier',
  'platform',
  'telephony',
  'routing',
  'analytics',
  'billing',
  'infrastructure',
  'security',
  'system',
];

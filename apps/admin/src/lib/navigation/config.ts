import type { NavGroup } from '../../types/navigation';

export const NAV_GROUP_LABELS: Record<NavGroup, string> = {
  operations: 'Operations Center',
  carrier: 'Carrier & Numbers',
  platform: 'Platform',
  telephony: 'PBX',
  routing: 'Call Routing',
  analytics: 'Analytics',
  billing: 'Billing',
  reports: 'Reports',
  infrastructure: 'Infrastructure',
  security: 'Security',
  system: 'System',
};

/** Nav group display order — platform admin surfaces carrier + billing after core platform items. */
export const NAV_GROUP_ORDER: NavGroup[] = [
  'platform',
  'carrier',
  'billing',
  'reports',
  'infrastructure',
  'operations',
  'telephony',
  'routing',
  'analytics',
  'security',
  'system',
];

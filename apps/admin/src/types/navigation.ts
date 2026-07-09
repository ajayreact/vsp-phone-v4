import type { LucideIcon } from 'lucide-react';

export type NavGroup =
  | 'operations'
  | 'carrier'
  | 'platform'
  | 'telephony'
  | 'routing'
  | 'analytics'
  | 'billing'
  | 'infrastructure'
  | 'security'
  | 'system';

export type ApiIntegrationStatus = 'live' | 'bff' | 'planned';

export type NavItem = {
  id: string;
  label: string;
  href: string;
  group: NavGroup;
  icon: LucideIcon;
  permission: string | string[];
  integration: ApiIntegrationStatus;
  description: string;
  /** Highlight as primary nav item (e.g. Telnyx Numbers) */
  primary?: boolean;
};

export type ModuleDefinition = NavItem & {
  breadcrumb: string[];
  prismaModels?: string[];
  apiEndpoints?: string[];
};

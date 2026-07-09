import type { LucideIcon } from 'lucide-react';

export type NavGroup = 'overview' | 'organization' | 'telephony' | 'routing' | 'analytics' | 'operations' | 'infrastructure' | 'security' | 'system';

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
};

export type ModuleDefinition = NavItem & {
  breadcrumb: string[];
  prismaModels?: string[];
  apiEndpoints?: string[];
};

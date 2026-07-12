import type { LucideIcon } from 'lucide-react';

export type NavGroup =
  | 'operations'
  | 'carrier'
  | 'platform'
  | 'telephony'
  | 'routing'
  | 'analytics'
  | 'billing'
  | 'reports'
  | 'infrastructure'
  | 'security'
  | 'system';

export type ApiIntegrationStatus = 'live' | 'bff' | 'planned';

/** Tenant Portal V2 collapsible sidebar section */
export type TenantNavSectionId =
  | 'dashboard'
  | 'extensions'
  | 'phone-numbers'
  | 'call-flow'
  | 'operations'
  | 'reports'
  | 'settings'
  | 'contact-center';

export type TenantNavSection = {
  id: TenantNavSectionId;
  label: string;
  items: ModuleDefinition[];
};

export type NavItem = {
  id: string;
  label: string;
  href: string;
  group: NavGroup;
  /** Tenant V2 accordion section (when set, item appears under collapsible group) */
  section?: TenantNavSectionId;
  icon: LucideIcon;
  permission: string | string[];
  integration: ApiIntegrationStatus;
  description: string;
  /** Highlight as primary nav item (e.g. Telnyx Numbers) */
  primary?: boolean;
  /** Hide from sidebar (e.g. wizard reached via CTA only) */
  hiddenFromNav?: boolean;
};

export type ModuleDefinition = NavItem & {
  breadcrumb: string[];
  prismaModels?: string[];
  apiEndpoints?: string[];
};

import type { PortalType } from '../portal/detect-portal';
import { detectPortal } from '../portal/detect-portal';
import { isTenantPortalV2NavEnabled } from '../feature-flags';
import { hasPermission } from '../rbac/permissions';
import { NAV_GROUP_LABELS, NAV_GROUP_ORDER } from './config';
import { OPS_MODULES } from './ops-nav';
import { PLATFORM_MODULES } from './platform-nav';
import { TENANT_MODULES } from './tenant-nav';
import { TENANT_MODULES_V2, buildTenantNavV2Sections } from './tenant-nav-v2';
import type { ModuleDefinition, TenantNavSection } from '../../types/navigation';

export { NAV_GROUP_LABELS, NAV_GROUP_ORDER };
export { buildTenantNavV2Sections };

export function getModulesForPortal(portal?: PortalType): ModuleDefinition[] {
  const resolved = portal ?? detectPortal();
  switch (resolved) {
    case 'platform':
      return PLATFORM_MODULES;
    case 'tenant':
      return isTenantPortalV2NavEnabled() ? TENANT_MODULES_V2 : TENANT_MODULES;
    case 'ops':
    default:
      return OPS_MODULES;
  }
}

export function getTenantNavSections(permissions: string[], portal?: PortalType): TenantNavSection[] {
  const modules = getModulesForPortal(portal).filter(
    (item) => !item.hiddenFromNav && hasPermission(permissions, item.permission),
  );
  return buildTenantNavV2Sections(modules);
}

export function isTenantAccordionNav(portal?: PortalType): boolean {
  const resolved = portal ?? detectPortal();
  return resolved === 'tenant' && isTenantPortalV2NavEnabled();
}

export function getModuleByHref(href: string, portal?: PortalType): ModuleDefinition | undefined {
  const modules = getModulesForPortal(portal);
  return modules.find((m) => m.href === href);
}

/** Legacy module ids used by content components → V2 nav module ids */
const TENANT_V2_MODULE_ALIASES: Record<string, string> = {
  organization: 'organization-company',
  'call-routing': 'incoming-routes',
  'paging-intercom': 'paging',
  settings: 'settings-pbx',
  reports: 'analytics',
  'audio-library': 'announcements',
  dids: 'my-numbers',
  'api-keys': 'settings-api-keys',
};

export function getModuleById(id: string, portal?: PortalType): ModuleDefinition | undefined {
  const modules = getModulesForPortal(portal);
  let found = modules.find((m) => m.id === id);
  if (found) return found;

  const resolved = portal ?? detectPortal();
  if (resolved === 'tenant' && isTenantPortalV2NavEnabled()) {
    const alias = TENANT_V2_MODULE_ALIASES[id];
    if (alias) found = modules.find((m) => m.id === alias);
    if (found) return found;
    return TENANT_MODULES.find((m) => m.id === id);
  }
  return undefined;
}

export function filterNavByPermissions(permissions: string[], portal?: PortalType): ModuleDefinition[] {
  return getModulesForPortal(portal).filter((item) => hasPermission(permissions, item.permission));
}

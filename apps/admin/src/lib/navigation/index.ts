import type { PortalType } from '../portal/detect-portal';
import { detectPortal } from '../portal/detect-portal';
import { hasPermission } from '../rbac/permissions';
import { NAV_GROUP_LABELS, NAV_GROUP_ORDER } from './config';
import { OPS_MODULES } from './ops-nav';
import { PLATFORM_MODULES } from './platform-nav';
import { TENANT_MODULES_V2, buildTenantNavV2Sections } from './tenant-nav-v2';
import type { ModuleDefinition, TenantNavSection } from '../../types/navigation';

export { NAV_GROUP_LABELS, NAV_GROUP_ORDER };
export { buildTenantNavV2Sections };

/** Extension Workspace is the permanent tenant architecture — no legacy nav fallback. */
export function getModulesForPortal(portal?: PortalType): ModuleDefinition[] {
  const resolved = portal ?? detectPortal();
  switch (resolved) {
    case 'platform':
      return PLATFORM_MODULES;
    case 'tenant':
      return TENANT_MODULES_V2;
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
  return resolved === 'tenant';
}

export function getModuleByHref(href: string, portal?: PortalType): ModuleDefinition | undefined {
  const modules = getModulesForPortal(portal);
  const path = href.split('?')[0] ?? href;
  const exact = modules.find((m) => m.href === path);
  if (exact) return exact;
  // Longest absolute href prefix (never invent child segments from pathname).
  return modules
    .filter((m) => path.startsWith(`${m.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Legacy module ids still referenced by shared content components → canonical V2 module ids. */
const TENANT_V2_MODULE_ALIASES: Record<string, string> = {
  organization: 'organization-company',
  'call-routing': 'incoming-routes',
  'paging-intercom': 'paging',
  settings: 'settings-pbx',
  reports: 'analytics',
  usage: 'usage',
  'audio-library': 'announcements',
  dids: 'number-inventory',
  'my-numbers': 'number-inventory',
  'api-keys': 'settings-api-keys',
};

export function getModuleById(id: string, portal?: PortalType): ModuleDefinition | undefined {
  const modules = getModulesForPortal(portal);
  const found = modules.find((m) => m.id === id);
  if (found) return found;

  const resolved = portal ?? detectPortal();
  if (resolved === 'tenant') {
    const alias = TENANT_V2_MODULE_ALIASES[id];
    if (alias) return modules.find((m) => m.id === alias);
  }
  return undefined;
}

export function filterNavByPermissions(
  permissions: string[],
  portal?: PortalType,
  opts?: { developerMode?: boolean },
): ModuleDefinition[] {
  return getModulesForPortal(portal).filter((item) => {
    if (item.hiddenFromNav) return false;
    if (!hasPermission(permissions, item.permission)) return false;
    if (item.requiresDeveloperMode && !opts?.developerMode) return false;
    return true;
  });
}

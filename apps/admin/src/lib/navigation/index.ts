import type { PortalType } from '../portal/detect-portal';
import { detectPortal } from '../portal/detect-portal';
import { hasPermission } from '../rbac/permissions';
import { NAV_GROUP_LABELS, NAV_GROUP_ORDER } from './config';
import { OPS_MODULES } from './ops-nav';
import { PLATFORM_MODULES } from './platform-nav';
import { TENANT_MODULES } from './tenant-nav';
import type { ModuleDefinition } from '../../types/navigation';

export { NAV_GROUP_LABELS, NAV_GROUP_ORDER };

export function getModulesForPortal(portal?: PortalType): ModuleDefinition[] {
  const resolved = portal ?? detectPortal();
  switch (resolved) {
    case 'platform':
      return PLATFORM_MODULES;
    case 'tenant':
      return TENANT_MODULES;
    case 'ops':
    default:
      return OPS_MODULES;
  }
}

export function getModuleByHref(href: string, portal?: PortalType): ModuleDefinition | undefined {
  const modules = getModulesForPortal(portal);
  return modules.find((m) => m.href === href);
}

export function getModuleById(id: string, portal?: PortalType): ModuleDefinition | undefined {
  const modules = getModulesForPortal(portal);
  return modules.find((m) => m.id === id);
}

export function filterNavByPermissions(permissions: string[], portal?: PortalType): ModuleDefinition[] {
  return getModulesForPortal(portal).filter((item) => hasPermission(permissions, item.permission));
}

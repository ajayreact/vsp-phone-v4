export const queryKeys = {
  ops: {
    dashboard: (tenantId?: string) => ['ops', 'dashboard', tenantId ?? 'global'] as const,
    health: () => ['ops', 'health'] as const,
  },
  telnyx: {
    numbers: (filters?: Record<string, string>) => ['telnyx', 'numbers', filters ?? {}] as const,
    number: (id: string) => ['telnyx', 'numbers', id] as const,
  },
  trunks: {
    all: () => ['trunks', 'list'] as const,
  },
  liveCalls: {
    list: (tenantId?: string) => ['live-calls', tenantId ?? 'global'] as const,
  },
  extensions: {
    list: (filters?: Record<string, string>) => ['extensions', filters ?? {}] as const,
  },
  resource: (moduleId: string, params?: Record<string, string>) =>
    ['resource', moduleId, params ?? {}] as const,
  tenants: {
    all: () => ['tenants', 'list'] as const,
  },
  billing: {
    summary: () => ['billing', 'summary'] as const,
  },
} as const;

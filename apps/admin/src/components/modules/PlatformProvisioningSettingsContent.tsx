'use client';

import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { usePlatformProvisioningSettings } from '../../lib/hooks/queries/use-platform';
import { ModuleAccessGate } from './shared/ModuleShell';
import { QueryState } from '../feedback/QueryState';
import { PageContainer, PageHeader } from '../layout/PageHeader';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader } from '../ui/Card';
import { StatusBadge } from '../ui/Badge';
import { Skeleton } from '../ui/Skeleton';

function statusTone(status: string): 'healthy' | 'warning' | 'error' {
  if (status === 'up') return 'healthy';
  if (status === 'degraded') return 'warning';
  return 'error';
}

export function PlatformProvisioningSettingsContent() {
  const query = usePlatformProvisioningSettings();
  const data = query.data;

  return (
    <ModuleAccessGate moduleId="provisioning-settings">
      {({ module }) => (
        <PageContainer>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}>
            <PageHeader
              title={module.label}
              description={module.description}
              actions={
                <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
                  <RefreshCw className={`mr-1 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              }
            />

            <QueryState
              isLoading={query.isLoading}
              isError={query.isError}
              error={query.error}
              onRetry={() => void query.refetch()}
              skeleton={
                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-40 rounded-2xl" />
                  ))}
                </div>
              }
            >
              {data ? (
                <div className="mt-6 space-y-6">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader title="Base Provision Server URL" />
                      <CardBody className="space-y-2 text-sm">
                        <p className="break-all font-mono text-base font-medium">{data.baseUrl}</p>
                        <p className="text-muted-foreground">
                          Configured via <code className="text-xs">PROV_PUBLIC_BASE_URL</code>. Tenant desk phones
                          receive per-device URLs under this base.
                        </p>
                      </CardBody>
                    </Card>

                    <Card>
                      <CardHeader title="Provisioning service status" />
                      <CardBody className="space-y-2 text-sm">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={statusTone(data.status.status)} />
                          {typeof data.status.latencyMs === 'number' ? (
                            <span className="text-muted-foreground">{data.status.latencyMs} ms</span>
                          ) : null}
                        </div>
                        <p className="break-all font-mono text-xs text-muted-foreground">{data.status.healthUrl}</p>
                        <p className="text-muted-foreground">
                          Checked {new Date(data.status.checkedAt).toLocaleString()}
                        </p>
                        {data.status.failureReason ? (
                          <p className="text-destructive">{data.status.failureReason}</p>
                        ) : null}
                      </CardBody>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader title="Supported vendors" />
                    <CardBody>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="pb-2 pr-4 font-medium">Vendor</th>
                              <th className="pb-2 pr-4 font-medium">Path</th>
                              <th className="pb-2 font-medium">Example URL</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.vendors.map((v) => (
                              <tr key={v.manufacturer} className="border-b border-border/60 last:border-0">
                                <td className="py-2 pr-4 font-medium">{v.label}</td>
                                <td className="py-2 pr-4 font-mono text-xs">/{v.path}</td>
                                <td className="py-2 break-all font-mono text-xs">{v.exampleUrl}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </CardBody>
                  </Card>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader title="Built-in template families" />
                      <CardBody className="space-y-3 text-sm">
                        {data.builtInTemplateFamilies.map((f) => (
                          <div key={f.manufacturer}>
                            <p className="font-medium">{f.label}</p>
                            <p className="text-muted-foreground">{f.families.join(', ')}</p>
                          </div>
                        ))}
                      </CardBody>
                    </Card>

                    <Card>
                      <CardHeader title="Configuration templates" />
                      <CardBody>
                        {data.templates.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No tenant templates found.</p>
                        ) : (
                          <div className="max-h-80 overflow-auto">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="border-b text-muted-foreground">
                                  <th className="pb-2 pr-3 font-medium">Name</th>
                                  <th className="pb-2 pr-3 font-medium">Vendor</th>
                                  <th className="pb-2 pr-3 font-medium">Family</th>
                                  <th className="pb-2 font-medium">Tenant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.templates.map((t) => (
                                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                                    <td className="py-2 pr-3">
                                      {t.name}
                                      {t.isDefault ? (
                                        <span className="ml-1 text-xs text-muted-foreground">(default)</span>
                                      ) : null}
                                    </td>
                                    <td className="py-2 pr-3">{t.manufacturer}</td>
                                    <td className="py-2 pr-3 font-mono text-xs">{t.modelFamily ?? '—'}</td>
                                    <td className="py-2">{t.tenantName}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  </div>
                </div>
              ) : null}
            </QueryState>
          </motion.div>
        </PageContainer>
      )}
    </ModuleAccessGate>
  );
}

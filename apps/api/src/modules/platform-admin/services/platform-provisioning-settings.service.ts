import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PROV_SUPPORTED_VENDORS,
  resolveProvPublicBaseUrl,
} from '../../provisioning/url/prov-config-url';
import { PrismaService } from '../../telecom/prisma/prisma.service';

export type PlatformProvisioningSettings = {
  baseUrl: string;
  vendors: Array<{
    manufacturer: string;
    label: string;
    path: string;
    exampleUrl: string;
  }>;
  status: {
    status: 'up' | 'down' | 'degraded';
    latencyMs?: number;
    checkedAt: string;
    healthUrl: string;
    failureReason?: string;
  };
  templates: Array<{
    id: string;
    name: string;
    manufacturer: string;
    modelFamily: string | null;
    templateKind: string;
    isDefault: boolean;
    tenantId: string;
    tenantName: string;
  }>;
  builtInTemplateFamilies: Array<{
    manufacturer: string;
    label: string;
    families: string[];
  }>;
};

@Injectable()
export class PlatformProvisioningSettingsService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getSettings(): Promise<PlatformProvisioningSettings> {
    const baseUrl = resolveProvPublicBaseUrl({
      ...process.env,
      PROV_PUBLIC_BASE_URL:
        this.config.get<string>('PROV_PUBLIC_BASE_URL') ?? process.env.PROV_PUBLIC_BASE_URL,
      PROV_HTTPS_PORT: String(
        this.config.get('PROV_HTTPS_PORT') ?? process.env.PROV_HTTPS_PORT ?? '3444',
      ),
      NODE_ENV: this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
      VSP_ENV: this.config.get<string>('VSP_ENV') ?? process.env.VSP_ENV,
    });

    const vendors = PROV_SUPPORTED_VENDORS.map((v) => ({
      manufacturer: v.manufacturer,
      label: v.label,
      path: v.path,
      exampleUrl: `${baseUrl}${v.examplePath.replace('{mac}', '000b820a1234')}`,
    }));

    const status = await this.probeHealth(baseUrl);

    const templateRows = this.prisma.connected
      ? await this.prisma.provisioningTemplate.findMany({
          where: { deletedAt: null },
          include: { tenant: { select: { id: true, name: true, displayName: true } } },
          orderBy: [{ manufacturer: 'asc' }, { name: 'asc' }],
          take: 200,
        })
      : [];

    const templates = templateRows.map((t) => ({
      id: t.id,
      name: t.name,
      manufacturer: String(t.manufacturer),
      modelFamily: t.modelFamily,
      templateKind: String(t.templateKind),
      isDefault: t.isDefault,
      tenantId: t.tenantId,
      tenantName: t.tenant.displayName || t.tenant.name,
    }));

    return {
      baseUrl,
      vendors,
      status,
      templates,
      builtInTemplateFamilies: [
        { manufacturer: 'GRANDSTREAM', label: 'Grandstream', families: ['grp261x', 'gxp21xx', 'ht8xx'] },
        { manufacturer: 'YEALINK', label: 'Yealink', families: ['t4x', 't5x', 'w60'] },
        { manufacturer: 'FANVIL', label: 'Fanvil', families: ['x3', 'x5', 'x7'] },
        { manufacturer: 'CISCO', label: 'Cisco', families: ['spa', 'mpp'] },
        { manufacturer: 'POLY', label: 'Poly', families: ['vvx', 'edge-e'] },
        { manufacturer: 'SNOM', label: 'Snom', families: ['d7xx', 'd8xx'] },
      ],
    };
  }

  private async probeHealth(baseUrl: string): Promise<PlatformProvisioningSettings['status']> {
    const healthUrl = `${baseUrl.replace(/\/$/, '')}/health`;
    const checkedAt = new Date().toISOString();
    const started = Date.now();
    try {
      const res = await fetch(healthUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(2500),
      });
      const latencyMs = Date.now() - started;
      if (!res.ok) {
        return {
          status: 'down',
          latencyMs,
          checkedAt,
          healthUrl,
          failureReason: `HTTP ${res.status}`,
        };
      }
      return { status: 'up', latencyMs, checkedAt, healthUrl };
    } catch (err) {
      return {
        status: 'down',
        latencyMs: Date.now() - started,
        checkedAt,
        healthUrl,
        failureReason: err instanceof Error ? err.message : String(err),
      };
    }
  }
}

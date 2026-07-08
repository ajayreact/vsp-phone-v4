import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ProvisioningOrchestratorService } from '../orchestrator/provisioning-orchestrator.service';
import { isValidMac, normalizeMac, ProvisioningVaultService } from '../vault/provisioning-vault.service';

/** HTTP Basic auth for Grandstream prov edge (ADR-042). */
@Injectable()
export class ProvMacAuthGuard implements CanActivate {
  constructor(
    private readonly vault: ProvisioningVaultService,
    private readonly orchestrator: ProvisioningOrchestratorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const macParam = String(req.params.mac ?? '');
    const mac = normalizeMac(macParam);
    if (!isValidMac(mac)) {
      throw new UnauthorizedException('Invalid MAC');
    }

    const lookup = await this.orchestrator.lookupMac(mac);
    if (!lookup) {
      await this.orchestrator.quarantineUnknownMac(mac, {
        srcIp: req.ip,
        userAgent: req.headers['user-agent'],
      });
      throw new UnauthorizedException('Unknown device');
    }

    const cred = this.vault.resolveProvHttp(mac);
    if (!cred) {
      throw new UnauthorizedException('Provisioning credentials missing');
    }

    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Basic ')) {
      throw new UnauthorizedException('Basic auth required');
    }
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const username = sep >= 0 ? decoded.slice(0, sep) : decoded;
    const password = sep >= 0 ? decoded.slice(sep + 1) : '';
    if (username.toLowerCase() !== cred.username || password !== cred.password) {
      throw new UnauthorizedException('Invalid provisioning credentials');
    }

    (req as Request & { provMac: string; provDeviceId: string; provTenantId: string }).provMac = mac;
    (req as Request & { provDeviceId: string }).provDeviceId = lookup.deviceId;
    (req as Request & { provTenantId: string }).provTenantId = lookup.tenantId;
    return true;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { resolveRequestId } from '../../../common/errors/request-id.middleware';
import { ProvisioningOrchestratorService } from '../orchestrator/provisioning-orchestrator.service';
import {
  extractBasicAuthUsername,
  resolveGrandstreamProvPath,
  resolveProvMacFromRequest,
} from '../url/grandstream-prov-path.util';
import { ProvisioningVaultService } from '../vault/provisioning-vault.service';

/** HTTP Basic auth for Grandstream prov edge (ADR-042). */
@Injectable()
export class ProvMacAuthGuard implements CanActivate {
  private readonly logger = new Logger(ProvMacAuthGuard.name);

  constructor(
    private readonly vault: ProvisioningVaultService,
    private readonly orchestrator: ProvisioningOrchestratorService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const requestId = resolveRequestId(req);
    const requestPath = req.path || req.url;
    const pathResolution = resolveGrandstreamProvPath(requestPath);
    if (requestPath.startsWith('/gs/') && !pathResolution.style) {
      throw new NotFoundException('Unknown provisioning path');
    }

    const authUsername = extractBasicAuthUsername(req.headers.authorization);
    const routeMacParam = req.params.mac;
    const routeMac = Array.isArray(routeMacParam) ? routeMacParam[0] : routeMacParam;
    const mac = resolveProvMacFromRequest(requestPath, routeMac, authUsername ?? undefined);
    if (!mac) {
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

    const cred = await this.vault.resolveProvHttp(mac);
    if (!cred) {
      this.logger.warn(
        JSON.stringify({
          event: 'provisioning.credentials.missing',
          mac,
          deviceId: lookup.deviceId,
          tenantId: lookup.tenantId,
          requestId,
        }),
      );
      throw new UnauthorizedException('Provisioning credentials missing');
    }

    if (!authUsername) {
      throw new UnauthorizedException('Basic auth required');
    }
    const header = req.headers.authorization ?? '';
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const sep = decoded.indexOf(':');
    const username = authUsername;
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

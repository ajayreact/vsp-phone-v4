import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import { FirmwareCatalogService } from '../firmware/firmware-catalog.service';
import { ProvMacAuthGuard } from '../guards/prov-mac-auth.guard';
import { ProvisioningOrchestratorService } from '../orchestrator/provisioning-orchestrator.service';
import { ArtifactStoreService } from '../store/artifact-store.service';

/** Phase 11 — HTTPS provisioning edge (ADR-042 canonical paths). */
@Controller()
export class ProvEdgeController {
  constructor(
    private readonly orchestrator: ProvisioningOrchestratorService,
    private readonly store: ArtifactStoreService,
    private readonly firmware: FirmwareCatalogService,
  ) {}

  @Get('gs/:mac/cfg.xml')
  @UseGuards(ProvMacAuthGuard)
  async downloadGrandstreamConfig(
    @Param('mac') mac: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendConfig(mac, req, res);
  }

  @Get('yealink/:mac/cfg.xml')
  @UseGuards(ProvMacAuthGuard)
  async downloadYealinkConfig(
    @Param('mac') mac: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendConfig(mac, req, res);
  }

  @Get('fanvil/:mac/cfg.xml')
  @UseGuards(ProvMacAuthGuard)
  async downloadFanvilConfig(
    @Param('mac') mac: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendConfig(mac, req, res);
  }

  @Get('poly/:mac/cfg.xml')
  @UseGuards(ProvMacAuthGuard)
  async downloadPolyConfig(
    @Param('mac') mac: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendConfig(mac, req, res);
  }

  @Get('cisco/:mac/cfg.xml')
  @UseGuards(ProvMacAuthGuard)
  async downloadCiscoConfig(
    @Param('mac') mac: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendConfig(mac, req, res);
  }

  @Get('snom/:mac/cfg.xml')
  @UseGuards(ProvMacAuthGuard)
  async downloadSnomConfig(
    @Param('mac') mac: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendConfig(mac, req, res);
  }

  @Get('sip/:mac/cfg.xml')
  @UseGuards(ProvMacAuthGuard)
  async downloadGenericConfig(
    @Param('mac') mac: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sendConfig(mac, req, res);
  }

  private async sendConfig(mac: string, req: Request, res: Response): Promise<void> {
    const xml = await this.orchestrator.serveConfig(mac, {
      srcIp: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(xml);
  }

  @Get('fw/:modelFamily/:version/:filename')
  async downloadFirmware(
    @Param('modelFamily') modelFamily: string,
    @Param('version') version: string,
    @Param('filename') filename: string,
    @Res() res: Response,
  ): Promise<void> {
    const release = this.firmware.findExact(modelFamily, version, filename);
    if (!release) {
      throw new NotFoundException('Firmware not in catalog');
    }
    const path = this.store.firmwarePath(release.modelFamily, release.version, release.filename);
    try {
      const data = await readFile(path);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.status(200).send(data);
    } catch {
      throw new NotFoundException('Firmware binary not staged');
    }
  }

  @Get('health')
  health(): { ok: boolean; service: string } {
    return { ok: true, service: 'prov-edge' };
  }
}

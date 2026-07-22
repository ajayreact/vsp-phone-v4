import {
  Controller,
  Get,
  Logger,
  NotFoundException,
  Param,
  Req,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { readFile } from 'node:fs/promises';
import { ProvEdgeExceptionFilter } from '../filters/prov-edge-exception.filter';
import { FirmwareCatalogService } from '../firmware/firmware-catalog.service';
import { ProvMacAuthGuard } from '../guards/prov-mac-auth.guard';
import { ProvisioningOrchestratorService } from '../orchestrator/provisioning-orchestrator.service';
import { ArtifactStoreService } from '../store/artifact-store.service';
import {
  canonicalGrandstreamProvPath,
  resolveGrandstreamProvPath,
} from '../url/grandstream-prov-path.util';

type ProvAuthedRequest = Request & {
  provMac: string;
  provDeviceId: string;
  provTenantId: string;
};

/** Phase 11 — HTTPS provisioning edge (ADR-042 canonical paths). */
@Controller()
@UseFilters(ProvEdgeExceptionFilter)
export class ProvEdgeController {
  private readonly logger = new Logger(ProvEdgeController.name);

  constructor(
    private readonly orchestrator: ProvisioningOrchestratorService,
    private readonly store: ArtifactStoreService,
    private readonly firmware: FirmwareCatalogService,
  ) {}

  /**
   * Grandstream catch-all: legacy `/gs/{mac}/cfg.xml`, native filenames
   * (`/gs/cfg{mac}.xml`, `/gs/cfggrp2601.xml`, `/gs/cfg.xml`), and directory-style
   * paths when cfg.xml is configured as a directory base.
   */
  @Get('gs/*')
  @UseGuards(ProvMacAuthGuard)
  async downloadGrandstreamConfig(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.sendGrandstreamConfig(req, res);
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

  private async sendGrandstreamConfig(req: Request, res: Response): Promise<void> {
    const resolution = resolveGrandstreamProvPath(req.path || req.url);
    if (!resolution.style) {
      throw new NotFoundException('Unknown provisioning path');
    }

    const provReq = req as ProvAuthedRequest;
    const mac = provReq.provMac;
    const normalizedUri = canonicalGrandstreamProvPath(mac);
    const requestMeta = {
      srcIp: req.ip,
      userAgent: req.headers['user-agent'],
      requestedUri: resolution.requestedPath,
      normalizedUri,
    };

    const xml = await this.orchestrator.serveConfig(mac, requestMeta);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(xml);

    this.logger.log(
      JSON.stringify({
        event: 'provisioning.request',
        requestedUri: resolution.requestedPath,
        normalizedUri,
        mac,
        userAgent: requestMeta.userAgent,
        httpStatus: 200,
      }),
    );
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

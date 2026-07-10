import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type FirmwareChannel = 'stable' | 'n-1' | 'emergency';

export interface FirmwareRelease {
  modelFamily: string;
  version: string;
  filename: string;
  channel: FirmwareChannel;
}

/** Phase 11 — curated firmware catalog (ops metadata; binaries in artifact store). */
@Injectable()
export class FirmwareCatalogService {
  private readonly catalog: FirmwareRelease[];

  constructor(config: ConfigService) {
    const stable = config.get<string>('PROV_FIRMWARE_STABLE_VERSION', '1.0.5.12');
    const prev = config.get<string>('PROV_FIRMWARE_N1_VERSION', '1.0.5.11');
    const emergency = config.get<string>('PROV_FIRMWARE_EMERGENCY_VERSION', '1.0.5.10');
    this.catalog = [
      { modelFamily: 'grp261x', version: stable, filename: 'grp261x-fw.bin', channel: 'stable' },
      { modelFamily: 'grp261x', version: prev, filename: 'grp261x-fw.bin', channel: 'n-1' },
      { modelFamily: 'grp261x', version: emergency, filename: 'grp261x-fw.bin', channel: 'emergency' },
      { modelFamily: 'gxp21xx', version: stable, filename: 'gxp21xx-fw.bin', channel: 'stable' },
      { modelFamily: 't46u', version: stable, filename: 't46u-fw.bin', channel: 'stable' },
      { modelFamily: 't54w', version: stable, filename: 't54w-fw.bin', channel: 'stable' },
      { modelFamily: 'x4u', version: stable, filename: 'x4u-fw.bin', channel: 'stable' },
      { modelFamily: 'vvx450', version: stable, filename: 'vvx450-fw.bin', channel: 'stable' },
      { modelFamily: 'cp8841', version: stable, filename: 'cp8841-fw.bin', channel: 'stable' },
      { modelFamily: 'd735', version: stable, filename: 'd735-fw.bin', channel: 'stable' },
    ];
  }

  resolve(modelFamily: string, channel: FirmwareChannel): FirmwareRelease | null {
    const family = modelFamily.toLowerCase();
    return (
      this.catalog.find((r) => r.modelFamily === family && r.channel === channel) ??
      this.catalog.find((r) => r.modelFamily === family && r.channel === 'stable') ??
      null
    );
  }

  findExact(modelFamily: string, version: string, filename: string): FirmwareRelease | null {
    return (
      this.catalog.find(
        (r) =>
          r.modelFamily === modelFamily.toLowerCase() &&
          r.version === version &&
          r.filename === filename,
      ) ?? null
    );
  }

  firmwareUrl(baseUrl: string, release: FirmwareRelease): string {
    const base = baseUrl.replace(/\/$/, '');
    return `${base}/fw/${release.modelFamily}/${release.version}/${release.filename}`;
  }
}

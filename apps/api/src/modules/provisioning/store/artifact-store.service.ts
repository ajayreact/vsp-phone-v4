import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeMac } from '../vault/provisioning-vault.service';

export interface ArtifactRef {
  artifactHash: string;
  objectKey: string;
  configVersion: number;
  templateVersion: string;
}

@Injectable()
export class ArtifactStoreService {
  private readonly logger = new Logger(ArtifactStoreService.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = config.get<string>('PROV_ARTIFACT_ROOT', './data/provisioning');
  }

  computeArtifactHash(parts: Record<string, string | number>): string {
    const payload = Object.keys(parts)
      .sort()
      .map((k) => `${k}=${parts[k]}`)
      .join('|');
    return createHash('sha256').update(payload).digest('hex').slice(0, 32);
  }

  objectKey(tenantId: string, mac: string, artifactHash: string): string {
    return join('prov', tenantId, 'gs', normalizeMac(mac), `${artifactHash}.xml`);
  }

  async saveArtifact(params: {
    tenantId: string;
    mac: string;
    artifactHash: string;
    xml: string;
  }): Promise<ArtifactRef> {
    const key = this.objectKey(params.tenantId, params.mac, params.artifactHash);
    const fullPath = join(this.root, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, params.xml, 'utf8');
    this.logger.debug(JSON.stringify({ event: 'prov.artifact.saved', key }));
    return {
      artifactHash: params.artifactHash,
      objectKey: key,
      configVersion: 0,
      templateVersion: '',
    };
  }

  async readArtifact(objectKey: string): Promise<string | null> {
    try {
      return await readFile(join(this.root, objectKey), 'utf8');
    } catch {
      return null;
    }
  }

  firmwarePath(modelFamily: string, version: string, filename: string): string {
    return join(this.root, 'fw', modelFamily, version, filename);
  }
}

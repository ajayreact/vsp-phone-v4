import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Phase 18 — release metadata (version, commit, build, environment). */
@Injectable()
export class ReleaseInfoService {
  private readonly packageVersion: string;

  constructor(private readonly config: ConfigService) {
    this.packageVersion = this.readPackageVersion();
  }

  getVersionInfo(): Record<string, unknown> {
    return {
      application: 'vsp-phone-v4-api',
      version: this.config.get('RELEASE_NUMBER') ?? this.packageVersion,
      packageVersion: this.packageVersion,
      gitCommit:
        this.config.get('BUILD_GIT_COMMIT') ??
        this.config.get('GIT_COMMIT') ??
        process.env.GIT_COMMIT ??
        null,
      buildTimestamp:
        this.config.get('BUILD_TIMESTAMP') ?? process.env.BUILD_TIMESTAMP ?? null,
      deploymentEnvironment: this.config.get('VSP_ENV') ?? 'development',
      nodeEnv: this.config.get('NODE_ENV') ?? 'development',
      releaseNumber: this.config.get('RELEASE_NUMBER') ?? this.packageVersion,
      phase: 'remediation-complete',
    };
  }

  private readPackageVersion(): string {
    try {
      const pkgPath = join(process.cwd(), 'package.json');
      const raw = readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw) as { version?: string };
      return pkg.version ?? '4.0.0-rc1';
    } catch {
      return '4.0.0-rc1';
    }
  }
}

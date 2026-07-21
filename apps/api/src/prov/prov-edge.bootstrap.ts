import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { requestIdMiddleware } from '../common/errors/request-id.middleware';
import { ProvEdgeModule } from '../modules/provisioning/prov-edge.module';
import { loadProvHttpsOptions } from '../app/tls.options';

/** Bootstrap HTTPS provisioning edge on PROV_HTTPS_PORT (ADR-042). */
export async function bootstrapProvEdge(): Promise<void> {
  const enabled = (process.env.PROV_HTTPS_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!enabled) {
    Logger.log(JSON.stringify({ event: 'prov.edge.disabled' }));
    return;
  }

  const httpsOptions = loadProvHttpsOptions(process.env);
  const app = await NestFactory.create(ProvEdgeModule, {
    bufferLogs: true,
    ...(httpsOptions ? { httpsOptions } : {}),
  });
  const config = app.get(ConfigService);
  const port = config.get<number>('PROV_HTTPS_PORT', 3444);
  const baseUrl =
    config.get<string>('PROV_PUBLIC_BASE_URL') || `https://prov.localhost:${port}`;

  app.use(requestIdMiddleware);
  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');

  Logger.log(
    JSON.stringify({
      event: 'prov.edge.started',
      port,
      tls: Boolean(httpsOptions),
      cfgPath: `${baseUrl}/gs/{mac}/cfg.xml`,
      health: `${baseUrl}/health`,
    }),
  );
}

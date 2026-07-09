import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app/app.module';
import { loadHttpsOptions } from './app/tls.options';
import { redactLogMessage } from './modules/enterprise-security/secrets/log-redaction.service';
import { bootstrapProvEdge } from './prov/prov-edge.bootstrap';
import { TELECOM_HEADERS } from './common/telecom/telecom.headers';

function configureStructuredLogging() {
  const format = process.env.LOG_FORMAT ?? 'json';
  if (format !== 'json') {
    return;
  }

  const wrap =
    (level: 'log' | 'error' | 'warn' | 'debug' | 'verbose') =>
    (message: unknown, ...optionalParams: unknown[]) => {
      const payload = {
        level: level === 'log' ? 'info' : level,
        service: 'api',
        timestamp: new Date().toISOString(),
        message: redactLogMessage(message),
        meta: optionalParams.length
          ? optionalParams.map((p) => redactLogMessage(p))
          : undefined,
      };
      // eslint-disable-next-line no-console
      console[level === 'log' ? 'log' : level === 'verbose' ? 'log' : level](JSON.stringify(payload));
    };

  Logger.overrideLogger({
    log: wrap('log'),
    error: wrap('error'),
    warn: wrap('warn'),
    debug: wrap('debug'),
    verbose: wrap('verbose'),
  });
}

export function buildOpenApiDocumentConfig() {
  return new DocumentBuilder()
    .setTitle('VSP Phone v4 — Telecom API')
    .setDescription(
      'Enterprise telecom platform API — Kamailio HTTP contracts, admin surfaces, production cutover (Remediation complete).',
    )
    .setVersion('1.0.0-remediation')
    .addTag('telecom', 'Kamailio ↔ NestJS telecom contracts')
    .addApiKey(
      {
        type: 'apiKey',
        in: 'header',
        name: TELECOM_HEADERS.SERVICE_AUTH,
        description: 'Shared telecom service credential (HMAC/token stub)',
      },
      'telecom-service-auth',
    )
    .build();
}

async function bootstrap() {
  try {
    const httpsOptions = loadHttpsOptions(process.env);
    const app = await NestFactory.create(AppModule, {
      bufferLogs: true,
      ...(httpsOptions ? { httpsOptions } : {}),
    });
    configureStructuredLogging();
    const configService = app.get(ConfigService);
    const globalPrefix = configService.get<string>('API_GLOBAL_PREFIX', 'api');
    const port = configService.get<number>('PORT', 3000);
    const envName = configService.get<string>('VSP_ENV', 'development');
    const tlsEnabled = Boolean(httpsOptions);
    const swaggerRaw = configService.get<boolean | string>('SWAGGER_ENABLED', true);
    const swaggerEnabled =
      typeof swaggerRaw === 'boolean'
        ? swaggerRaw
        : String(swaggerRaw).toLowerCase() !== 'false';

    app.setGlobalPrefix(globalPrefix);
    const bodyLimit = configService.get<string>('REQUEST_BODY_MAX_BYTES') ?? '1mb';
    app.use(json({ limit: bodyLimit }));
    app.use(urlencoded({ extended: true, limit: bodyLimit }));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.enableShutdownHooks();

    if (swaggerEnabled) {
      const document = SwaggerModule.createDocument(app, buildOpenApiDocumentConfig());
      SwaggerModule.setup(`${globalPrefix}/docs`, app, document, {
        jsonDocumentUrl: `${globalPrefix}/docs-json`,
        yamlDocumentUrl: `${globalPrefix}/docs-yaml`,
      });
    }

    await app.listen(port, '0.0.0.0');

    void bootstrapProvEdge().catch((err) => {
      Logger.error(
        JSON.stringify({
          event: 'prov.edge.bootstrap_failed',
          message: err instanceof Error ? err.message : String(err),
        }),
      );
    });

    const scheme = tlsEnabled ? 'https' : 'http';
    Logger.log(
      JSON.stringify({
        event: 'api.started',
        env: envName,
        port,
        tls: tlsEnabled,
        prefix: globalPrefix,
        health: `${scheme}://0.0.0.0:${port}/${globalPrefix}/health`,
        ready: `${scheme}://0.0.0.0:${port}/${globalPrefix}/ready`,
        telecomHealth: `${scheme}://0.0.0.0:${port}/${globalPrefix}/v1/telecom/health`,
        openapi: swaggerEnabled
          ? `${scheme}://0.0.0.0:${port}/${globalPrefix}/docs`
          : undefined,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.stack ?? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(JSON.stringify({ level: 'error', service: 'api', event: 'bootstrap.failed', message }));
    process.exit(1);
  }
}

bootstrap();

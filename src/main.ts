import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as os from 'os';
import { AppModule } from './app.module';
import { validateSecurityConfig } from './config/security-config';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

// ═══════════════════════════════════════════════════════════════
// Helper: Get Local Network IP
// ═══════════════════════════════════════════════════════════════
function getLocalNetworkIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('127.')) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ═══════════════════════════════════════════════════════════════
// Bootstrap
// ═══════════════════════════════════════════════════════════════
async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // ──── Fail fast on insecure/missing security config ────
  validateSecurityConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // [SHUTDOWN] Enable graceful shutdown hooks
  // Captures SIGTERM (Render/Docker) and SIGINT (Ctrl+C) signals.
  // NestJS will call OnModuleDestroy on all providers before exiting,
  // allowing in-flight transactions to complete.
  app.enableShutdownHooks();

  // ──── Security headers ────
  app.use(helmet());

  // ──── CORS — Smart Origin Handling ────
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  const allowedOrigins: boolean | string[] = isProduction
    ? [
        'https://rezvio.ir',
        'https://www.rezvio.ir',
        'https://app.rezvio.ir',
      ]
    : true;

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    // [CORS-FIX] Added 'Idempotency-Key' to allowed headers
    // Without this, browser blocks cross-origin POST requests with idempotency key
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Current-Session-Id',
      'Idempotency-Key',
    ],
    maxAge: 86400,
  });

  // ──── Global ValidationPipe ────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ──── Global Exception Filter ────
  app.useGlobalFilters(new HttpExceptionFilter());

  // ──── Swagger (API docs) — non-production only ────
  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Rezvio API')
      .setDescription('Multi-tenant booking SaaS API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  } else {
    console.log('📚 Swagger docs: disabled in PRODUCTION');
  }

  // ──── Start Server ────
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  // [SHUTDOWN] Log graceful shutdown events for debugging
  process.on('SIGTERM', () => {
    logger.warn('⚠️ SIGTERM received — starting graceful shutdown...');
  });
  process.on('SIGINT', () => {
    logger.warn('⚠️ SIGINT received — starting graceful shutdown...');
  });

  // ──── Console Logs ────
  const localIP = getLocalNetworkIP();
  console.log(`🚀 Rezvio API running on http://localhost:${port}`);
  console.log(`🚀 Network URL: http://${localIP}:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  console.log(`🌍 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`🛡️ Graceful Shutdown: ENABLED`);
  if (!isProduction) {
    console.log(`📱 Mobile test URL: http://${localIP}:${port}`);
    console.log(`💡 CORS: permissive (all origins allowed in dev mode)`);
  }
}

bootstrap();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as os from 'os';
import { AppModule } from './app.module';

// ═══════════════════════════════════════════════════════════════
// Helper: Get Local Network IP
// ═══════════════════════════════════════════════════════════════
function getLocalNetworkIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      // IPv4 + non-internal (not 127.0.0.1) + active
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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ──── Security headers ────
  app.use(helmet());

  // ──── CORS — Smart Origin Handling ────
  // Dev mode: allow all origins (mobile, local, any network IP)
  // Production: whitelist specific domains
  const isProduction = process.env.NODE_ENV === 'production';

  const allowedOrigins: boolean | string[] = isProduction
    ? [
        'https://rezvio.ir',
        'https://www.rezvio.ir',
        'https://app.rezvio.ir',
        // Add Vercel preview URLs here if needed
      ]
    : true; // true = allow ALL origins in dev (mobile testing works automatically)

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // 24h preflight cache
  });

  // ──── Global ValidationPipe ────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // ──── Swagger (API docs) ────
  const config = new DocumentBuilder()
    .setTitle('Rezvio API')
    .setDescription('Multi-tenant booking SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // ──── Start Server ────
  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');

  // ──── Console Logs (Dynamic IP — no hardcoding!) ────
  const localIP = getLocalNetworkIP();
  console.log(`🚀 Rezvio API running on http://localhost:${port}`);
  console.log(`🚀 Network URL: http://${localIP}:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
  console.log(`🌍 Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  if (!isProduction) {
    console.log(`📱 Mobile test URL: http://${localIP}:${port}`);
    console.log(`💡 CORS: permissive (all origins allowed in dev mode)`);
  }
}

bootstrap();
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
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
  // ──── Fail fast on insecure/missing security config ────
  validateSecurityConfig(process.env);

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // ──── Security headers ────
  app.use(helmet());

  // ──── CORS — Smart Origin Handling ────
  // Dev mode: allow all origins (mobile, local, any network IP)
  // Production: whitelist specific domains
  const isProduction = process.env.NODE_ENV === 'production';

  // ──── پشت reverse proxy (Render): IP واقعی کلاینت را از X-Forwarded-For بگیر ────
  // بدون این، req.ip آی‌پی پروکسی است و throttler/سشن‌ها/کپچا همه کاربران را یکی می‌بینند.
  // مقدار 1 = دقیقاً یک hop مورد اعتماد (Render). اگر جلوی Render یک CDN دیگر
  // (مثل Cloudflare) گذاشتی باید عدد را متناسب زیاد کنی؛ هرگز true نگذار (قابل جعل می‌شود).
  if (isProduction) {
    app.set('trust proxy', 1);
  }

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
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Current-Session-Id'],
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

  // ──── Global Exception Filter (شکل واحد خطا) ────
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
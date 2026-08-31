import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 🔒 Security headers
  app.use(helmet());

  // CORS — origins اضافی (مثل IP شبکه برای تست موبایل) از env خوانده می‌شن
  const extraOrigins = (process.env.CORS_EXTRA_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', ...extraOrigins],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    maxAge: 86400,
  });

  // Global ValidationPipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger
  const config = new DocumentBuilder()
    .setTitle('Rezvio API')
    .setDescription('Multi-tenant booking SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;

  // Listen روی همه اینترفیس‌ها (نه فقط localhost)
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Rezvio API running on http://localhost:${port}`);
  console.log(`🚀 API also available on network: http://10.249.135.225:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
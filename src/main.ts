import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS - اجازه دسترسی فرانت‌اند به API
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  // Global ValidationPipe - اعتبارسنجی خودکار همه DTOها
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // فیلدهای اضافی رو حذف می‌کنه
      forbidNonWhitelisted: true, // اگه فیلد اضافی بود، ارور می‌ده
      transform: true, // تبدیل خودکار تایپ‌ها
    }),
  );

  // Swagger - مستندسازی خودکار API
  const config = new DocumentBuilder()
    .setTitle('Reservino API')
    .setDescription('Multi-tenant booking SaaS API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`🚀 Reservino API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
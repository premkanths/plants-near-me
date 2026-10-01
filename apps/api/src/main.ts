import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // `rawBody` keeps the untouched bytes around: Razorpay signs the exact
  // payload it sent, so a re-serialised JSON object would not verify.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? '*').split(',').map((o) => o.trim()),
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');

  console.log(`API listening on http://0.0.0.0:${port}/api`);
}

void bootstrap();

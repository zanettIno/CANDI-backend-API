// main.ts

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from 'fastify-cookie'; // Você já tem este import

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.enableCors({
    origin: ['http://localhost:8081', 'http://localhost:19006'],
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  });


  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'supersecret',
  });

  await app.listen(3000, '0.0.0.0');
}
bootstrap();
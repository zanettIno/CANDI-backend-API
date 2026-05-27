import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import fastifyCookie from 'fastify-cookie';
import multipart from '@fastify/multipart';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  await app.register(multipart, {
    attachFieldsToBody: true,
  });

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET || 'supersecret',
  });

  await app.listen(3000, '0.0.0.0');
  console.log(`🚀 CANDI API rodando em http://0.0.0.0:3000`);
  console.log(`⚡ Socket.io ativo em ws://0.0.0.0:3000/chat`);
}
bootstrap();

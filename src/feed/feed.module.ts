// src/feed/feed.module.ts
import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { S3ProviderModule } from '../s3/s3.provider.module'; // 🔹 NOVO

@Module({
  imports: [
    AuthModule,     // Para usar o AuthGuard
    DynamoDBModule, // Para injetar o DYNAMO_CLIENT
    S3ProviderModule, // 🔹 Para usar o S3Provider no Service
  ],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}
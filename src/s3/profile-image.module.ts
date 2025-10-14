// src/s3/profile-image.module.ts
import { Module } from '@nestjs/common';
import { ProfileImageService } from './profile-image.service';
import { ProfileImageController } from './profile-image.controller';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { S3ProviderModule } from './s3.provider.module';

@Module({
  imports: [DynamoDBModule, AuthModule, S3ProviderModule],
  providers: [ProfileImageService],
  controllers: [ProfileImageController],
})
export class ProfileImageModule {}

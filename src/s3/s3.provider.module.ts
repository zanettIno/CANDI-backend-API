// src/s3/s3.provider.module.ts
import { Module } from '@nestjs/common';
import { S3Provider } from './s3.provider';

@Module({
  providers: [S3Provider],
  exports: [S3Provider],
})
export class S3ProviderModule {}

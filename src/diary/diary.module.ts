import { Module } from '@nestjs/common';
import { DiaryController } from './diary.controller';
import { DiaryService } from './diary.service';
import { AuthModule } from '../auth/auth.module';
import { S3ProviderModule } from '../s3/s3.provider.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module'; // 🔹 importa o módulo com o DYNAMO_CLIENT

@Module({
  imports: [
    AuthModule,
    S3ProviderModule,
    DynamoDBModule, 
  ],
  controllers: [DiaryController],
  providers: [DiaryService],
})
export class DiaryModule {}

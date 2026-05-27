import { Module } from '@nestjs/common';
import { CommunityController } from './community.controller';
import { CommunityService } from './community.service';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { S3ProviderModule } from '../s3/s3.provider.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [AuthModule, DynamoDBModule, S3ProviderModule, ChatModule],
  controllers: [CommunityController],
  providers: [CommunityService],
  exports: [CommunityService],
})
export class CommunityModule {}

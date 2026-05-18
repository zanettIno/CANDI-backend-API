import { Module } from '@nestjs/common';
import { FeedController } from './feed.controller';
import { FeedService } from './feed.service';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { S3ProviderModule } from '../s3/s3.provider.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [AuthModule, DynamoDBModule, S3ProviderModule, ChatModule],
  controllers: [FeedController],
  providers: [FeedService],
})
export class FeedModule {}

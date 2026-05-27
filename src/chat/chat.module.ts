import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [
    AuthModule,     // Fornece JwtModule (usado no Gateway) e AuthGuard
    DynamoDBModule,
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
  exports: [ChatService, ChatGateway],
})
export class ChatModule {}

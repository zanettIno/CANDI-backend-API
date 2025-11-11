// src/chat/chat.module.ts
import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [
    AuthModule,     // 🔹 Para usar o AuthGuard
    DynamoDBModule, // 🔹 Para injetar o DYNAMO_CLIENT
  ],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
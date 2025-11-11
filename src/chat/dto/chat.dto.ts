// src/chat/dto/chat.dto.ts
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

// 🔹 DTO para iniciar uma nova conversa
export class StartConversationDto {
  @IsUUID()
  @IsNotEmpty()
  otherProfileId: string; // O ID do usuário com quem se quer falar
}

// 🔹 DTO para enviar uma mensagem
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  messageContent: string;
}
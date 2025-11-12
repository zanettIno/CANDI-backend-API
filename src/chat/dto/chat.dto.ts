// src/chat/dto/chat.dto.ts
import { IsNotEmpty, IsString, IsEmail } from 'class-validator';

// 🔹 DTO para iniciar uma nova conversa (usa email)
export class StartConversationDto {
  @IsEmail()
  @IsNotEmpty()
  otherUserEmail: string; // O email do usuário com quem se quer falar
}

// 🔹 DTO para enviar uma mensagem
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  messageContent: string;
}
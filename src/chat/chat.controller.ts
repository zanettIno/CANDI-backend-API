// src/chat/chat.controller.ts
import { Controller, Get, Post, Body, UseGuards, Req, Param, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ChatService } from './chat.service';
import { SendMessageDto, StartConversationDto } from './dto/chat.dto';

// Interface padrão para requisições autenticadas
interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
    profile_name: string;
    profile_nickname: string;
  };
}

@Controller('chat')
@UseGuards(AuthGuard) // 🔒 Protege todas as rotas do chat
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * (Tela 2) Rota para buscar a "Caixa de Entrada" do usuário.
   */
  @Get('inbox')
  async getInbox(@Req() req: AuthenticatedRequest) {
    return this.chatService.getInbox(req.user.profile_id);
  }

  /**
   * Rota para iniciar uma conversa com outro usuário (usando EMAIL).
   */
  @Post('start')
  async startConversation(
    @Req() req: AuthenticatedRequest,
    @Body() body: StartConversationDto, // ⬅️ Usa o DTO com otherUserEmail
  ) {
    if (req.user.profile_email === body.otherUserEmail) {
        throw new BadRequestException('Você não pode iniciar uma conversa consigo mesmo.');
    }
    
    // 🔹 CHAMA A FUNÇÃO PÚBLICA CORRETA
    return this.chatService.findOrCreateConversationByEmail(
      req.user,
      body.otherUserEmail,
    );
  }

  /**
   * (Tela 3) Rota para buscar as mensagens.
   */
  @Get('messages/:conversationId')
  async getMessages(
    @Req() req: AuthenticatedRequest, // ⬅️ ERRO CORRIGIDO AQUI
    @Param('conversationId') conversationId: string,
  ) {
    // 🔹 Decodifica o ID da URL (para o caractere '#')
    const decodedConversationId = decodeURIComponent(conversationId);
    return this.chatService.getMessages(req.user.profile_id, decodedConversationId);
  }

  /**
   * (Tela 3) Rota para enviar uma mensagem.
   */
  @Post('messages/:conversationId')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: SendMessageDto,
  ) {
    // 🔹 Decodifica o ID da URL (para o caractere '#')
    const decodedConversationId = decodeURIComponent(conversationId);
    return this.chatService.sendMessage(
      req.user,
      decodedConversationId,
      body.messageContent,
    );
  }
}
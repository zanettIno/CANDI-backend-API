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
    profile_name: string;  // Assumindo que o guard anexa o nome/nickname
    profile_nickname: string;
  };
}

@Controller('chat')
@UseGuards(AuthGuard) // 🔒 Protege todas as rotas do chat
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  /**
   * (Tela 2) Rota para buscar a "Caixa de Entrada" do usuário.
   * Lista todas as conversas ativas.
   */
  @Get('inbox')
  async getInbox(@Req() req: AuthenticatedRequest) {
    return this.chatService.getInbox(req.user.profile_id);
  }

  /**
   * Rota para iniciar uma conversa com outro usuário.
   * Retorna o ID da conversa (conversation_id), seja ela nova ou existente.
   */
  @Post('start')
  async startConversation(
    @Req() req: AuthenticatedRequest,
    @Body() body: StartConversationDto,
  ) {
    if (req.user.profile_id === body.otherProfileId) {
        throw new BadRequestException('Você não pode iniciar uma conversa consigo mesmo.');
    }
    
    // Precisamos do nome/nickname do outro usuário, que o serviço vai buscar
    return this.chatService.findOrCreateConversation(
      req.user,
      body.otherProfileId,
    );
  }

  /**
   * (Tela 3) Rota para buscar as mensagens de UMA conversa específica.
   */
  @Get('messages/:conversationId')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.getMessages(req.user.profile_id, conversationId);
  }

  /**
   * (Tela 3) Rota para enviar uma mensagem em UMA conversa específica.
   */
  @Post('messages/:conversationId')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: SendMessageDto,
  ) {
    return this.chatService.sendMessage(
      req.user,
      conversationId,
      body.messageContent,
    );
  }
}
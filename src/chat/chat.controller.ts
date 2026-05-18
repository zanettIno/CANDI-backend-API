// src/chat/chat.controller.ts
import { Controller, Get, Post, Body, UseGuards, Req, Param, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { SendMessageDto, StartConversationDto } from './dto/chat.dto';

interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
    profile_name: string;
    profile_nickname: string;
  };
}

@Controller('chat')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Get('inbox')
  async getInbox(@Req() req: AuthenticatedRequest) {
    return this.chatService.getInbox(req.user.profile_id);
  }

  @Post('start')
  async startConversation(
    @Req() req: AuthenticatedRequest,
    @Body() body: StartConversationDto,
  ) {
    if (req.user.profile_email === body.otherUserEmail) {
      throw new BadRequestException('Você não pode iniciar uma conversa consigo mesmo.');
    }
    return this.chatService.findOrCreateConversationByEmail(req.user, body.otherUserEmail);
  }

  @Get('read-status/:conversationId')
  async getReadStatus(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    return this.chatService.getReadStatus(req.user.profile_id, decodeURIComponent(conversationId));
  }

  @Get('messages/:conversationId')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const decodedId = decodeURIComponent(conversationId);
    const messages = await this.chatService.getMessages(req.user.profile_id, decodedId);
    // Notifica o remetente via WS que o receptor leu as mensagens
    this.chatGateway.notifyMessagesRead(decodedId, req.user.profile_id);
    return messages;
  }

  @Post('messages/:conversationId')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body() body: SendMessageDto,
  ) {
    const decodedId = decodeURIComponent(conversationId);
    return this.chatService.sendMessage(req.user, decodedId, body.messageContent);
  }
}

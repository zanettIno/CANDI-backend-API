import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';

interface AuthenticatedSocket extends Socket {
  user?: {
    profile_id: string;
    profile_name: string;
    profile_email: string;
    profile_nickname: string;
  };
}

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:8081', 'http://localhost:19006'],
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) throw new UnauthorizedException('Token não fornecido');

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      client.user = {
        profile_id: payload.id,
        profile_email: payload.email,
        profile_name: payload.name,
        profile_nickname: payload.nickname || payload.name,
      };

      console.log(`[Socket] Conectado: ${client.user.profile_id}`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(`[Socket] Desconectado: ${client.user?.profile_id || client.id}`);
  }

  // Cliente entra na sala da conversa
  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.join(data.conversationId);
    client.emit('joined', { conversationId: data.conversationId });
  }

  // Cliente sai da sala
  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave(data.conversationId);
  }

  // Cliente envia mensagem via WebSocket
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @MessageBody() data: { conversationId: string; messageContent: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.user) {
      client.emit('error', { message: 'Não autenticado' });
      return;
    }

    try {
      const newMessage = await this.chatService.sendMessage(
        client.user,
        data.conversationId,
        data.messageContent,
      );

      // Emite a mensagem para todos na sala (incluindo remetente)
      this.server.to(data.conversationId).emit('new_message', newMessage);
    } catch (err: any) {
      client.emit('error', { message: err.message || 'Erro ao enviar mensagem' });
    }
  }

  // Emite evento "digitando" para os outros da sala
  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { conversationId: string; isTyping: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.user) return;
    client.to(data.conversationId).emit('user_typing', {
      profile_id: client.user.profile_id,
      name: client.user.profile_nickname || client.user.profile_name,
      isTyping: data.isTyping,
    });
  }
}

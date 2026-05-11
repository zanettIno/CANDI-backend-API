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
import { createHash } from 'crypto';

interface AuthenticatedSocket extends Socket {
  user?: {
    profile_id: string;
    profile_name: string;
    profile_email: string;
    profile_nickname: string;
  };
}

// Converte conversationId (que pode ter #) em nome de sala seguro
function safeRoom(conversationId: string): string {
  return createHash('sha1').update(conversationId).digest('hex');
}

@WebSocketGateway({
  cors: { origin: '*', credentials: false },
  namespace: '/chat',
  transports: ['polling'],
  // 8s: bem abaixo do timeout de 100s do Cloudflare Tunnel
  pingInterval: 8000,
  pingTimeout: 20000,
  // Polling retorna imediatamente quando há evento; o cliente reconecta em seguida
  // polling interval curto = latência baixa sem manter conexões longas
  maxHttpBufferSize: 1e6,
  allowEIO3: true,
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // profileId → Set<socketId>  (um user pode ter múltiplas abas/apps)
  private onlineUsers = new Map<string, Set<string>>();

  constructor(
    private readonly chatService: ChatService,
    private readonly jwtService: JwtService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) throw new UnauthorizedException();

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
      });

      client.user = {
        profile_id: payload.id,
        profile_email: payload.email,
        profile_name: payload.name,
        profile_nickname: payload.nickname || payload.name,
      };

      // Registra presença
      const pid = client.user.profile_id;
      if (!this.onlineUsers.has(pid)) this.onlineUsers.set(pid, new Set());
      this.onlineUsers.get(pid)!.add(client.id);

      // Informa todos que este user ficou online
      this.server.emit('user_online', { profile_id: pid });

      // Envia ao próprio client a lista de quem está online agora
      client.emit('online_users', { online: [...this.onlineUsers.keys()] });

      console.log(`[Socket] Conectado: ${pid} (${client.id})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    if (!client.user) return;
    const pid = client.user.profile_id;
    const sockets = this.onlineUsers.get(pid);
    if (sockets) {
      sockets.delete(client.id);
      if (sockets.size === 0) {
        this.onlineUsers.delete(pid);
        // Só emite offline quando não tem mais nenhuma conexão
        this.server.emit('user_offline', { profile_id: pid });
      }
    }
    console.log(`[Socket] Desconectado: ${pid} (${client.id})`);
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = safeRoom(data.conversationId);
    client.join(room);
    client.emit('joined', { conversationId: data.conversationId, room });
  }

  @SubscribeMessage('leave_conversation')
  handleLeaveConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    client.leave(safeRoom(data.conversationId));
  }

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

      // Emite para todos na sala (remetente incluído)
      const room = safeRoom(data.conversationId);
      this.server.to(room).emit('new_message', newMessage);
    } catch (err: any) {
      client.emit('error', { message: err.message || 'Erro ao enviar' });
    }
  }

  @SubscribeMessage('typing')
  handleTyping(
    @MessageBody() data: { conversationId: string; isTyping: boolean },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.user) return;
    const room = safeRoom(data.conversationId);
    client.to(room).emit('user_typing', {
      profile_id: client.user.profile_id,
      name: client.user.profile_nickname || client.user.profile_name,
      isTyping: data.isTyping,
    });
  }

  // Permite consultar presença via evento
  @SubscribeMessage('get_online_users')
  handleGetOnlineUsers(@ConnectedSocket() client: AuthenticatedSocket) {
    client.emit('online_users', { online: [...this.onlineUsers.keys()] });
  }
}

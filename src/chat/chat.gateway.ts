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
  transports: ['websocket', 'polling'],
  // 8s: bem abaixo do timeout de 100s do Cloudflare Tunnel
  pingInterval: 8000,
  pingTimeout: 20000,
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
    console.log(`[Socket] Nova conexão: ${client.id}`);
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      console.log(`[Socket] Token recebido: ${token ? token.substring(0, 50) + '...' : 'não'}`);
      console.log(`[Socket] JWT_SECRET: ${process.env.JWT_SECRET ? 'definido' : 'INDEFINIDO'}`);
      if (!token) throw new UnauthorizedException('Sem token');

      const payload = this.jwtService.verify(token);

      console.log(`[Socket] Token verificado, userId: ${payload.id}`);

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

      console.log(`[Socket] Usuário ${pid} online. Total online: ${this.onlineUsers.size}`);

      // Informa todos que este user ficou online
      this.server.emit('user_online', { profile_id: pid });
      console.log(`[Socket] Emitido 'user_online' para ${pid}`);

      // Envia ao próprio client a lista de quem está online agora
      const onlineList = [...this.onlineUsers.keys()];
      client.emit('online_users', { online: onlineList });
      console.log(`[Socket] Emitido 'online_users' ao cliente ${client.id}: ${onlineList.join(', ')}`);
    } catch (err: any) {
      console.error(`[Socket] Erro na conexão: ${err.message}`, err);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    console.log(`[Socket] Desconexão de ${client.id}`);
    if (!client.user) {
      console.log(`[Socket] Cliente não tinha usuário autenticado`);
      return;
    }
    const pid = client.user.profile_id;
    const sockets = this.onlineUsers.get(pid);
    if (sockets) {
      sockets.delete(client.id);
      console.log(`[Socket] Removido ${client.id} de ${pid}. Restantes: ${sockets.size}`);
      if (sockets.size === 0) {
        this.onlineUsers.delete(pid);
        console.log(`[Socket] Usuário ${pid} completamente offline. Emitindo user_offline`);
        // Só emite offline quando não tem mais nenhuma conexão
        this.server.emit('user_offline', { profile_id: pid });
      }
    }
  }

  @SubscribeMessage('join_conversation')
  handleJoinConversation(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const room = safeRoom(data.conversationId);
    console.log(`[Socket] ${client.user?.profile_id} entrou na conversa: ${data.conversationId} (room: ${room})`);
    client.join(room);
    console.log(`[Socket] Room '${room}' agora tem ${this.server.sockets.adapter.rooms.get(room)?.size || 0} clientes`);
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
    console.log(`[Socket] send_message recebido de ${client.user?.profile_id}: "${data.messageContent}"`);

    if (!client.user) {
      console.error(`[Socket] Usuário não autenticado`);
      client.emit('error', { message: 'Não autenticado' });
      return;
    }

    try {
      console.log(`[Socket] Salvando mensagem no banco...`);
      const newMessage = await this.chatService.sendMessage(
        client.user,
        data.conversationId,
        data.messageContent,
      );

      console.log(`[Socket] Mensagem salva: ${newMessage.timestamp}`);

      // Emite para todos na sala (remetente incluído)
      const room = safeRoom(data.conversationId);
      const roomSize = this.server.sockets.adapter.rooms.get(room)?.size || 0;
      console.log(`[Socket] Emitindo para sala '${room}' (${roomSize} clientes)`);
      console.log(`[Socket] Payload da mensagem:`, JSON.stringify(newMessage));

      this.server.to(room).emit('new_message', newMessage);
      console.log(`[Socket] Mensagem emitida para ${roomSize} cliente(s)`);
    } catch (err: any) {
      console.error(`[Socket] Erro ao enviar: ${err.message}`, err);
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
    console.log(`[Socket] ${client.user.profile_id} typing=${data.isTyping} em sala ${room}`);
    client.to(room).emit('user_typing', {
      profile_id: client.user.profile_id,
      name: client.user.profile_nickname || client.user.profile_name,
      isTyping: data.isTyping,
    });
  }

  // Permite consultar presença via evento
  @SubscribeMessage('get_online_users')
  handleGetOnlineUsers(@ConnectedSocket() client: AuthenticatedSocket) {
    const onlineList = [...this.onlineUsers.keys()];
    console.log(`[Socket] get_online_users solicitado por ${client.user?.profile_id}. Online: ${onlineList.join(', ')}`);
    client.emit('online_users', { online: onlineList });
  }
}

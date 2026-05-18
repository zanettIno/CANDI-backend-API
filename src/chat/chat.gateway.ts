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
    console.log(`[Socket] Room '${room}' agora tem ${this.server.sockets.adapter?.rooms?.get(room)?.size || 0} clientes`);
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
      console.log(`[Socket] Payload da mensagem:`, JSON.stringify(newMessage));

      // Emite para todos na sala (remetente incluído)
      const room = safeRoom(data.conversationId);
      const roomSize = this.server.sockets.adapter?.rooms?.get(room)?.size || 0;
      console.log(`[Socket] Emitindo para sala '${room}' (${roomSize} clientes)`);

      this.server.to(room).emit('new_message', newMessage);

      if (!data.conversationId.startsWith('GROUP#')) {
        const parts = data.conversationId.split('#');
        const recipientId = parts.find(id => id !== client.user!.profile_id);
        const senderSockets = this.onlineUsers.get(client.user!.profile_id);

        if (recipientId) {
          const recipientSockets = this.onlineUsers.get(recipientId);

          if (recipientSockets) {
            // Destinatário online → inbox_update (notificação)
            for (const socketId of recipientSockets) {
              this.server.to(socketId).emit('inbox_update', {
                conversation_id: data.conversationId,
                sender_name: client.user!.profile_nickname || client.user!.profile_name || client.user!.profile_email?.split('@')[0] || 'Usuário',
                last_message: data.messageContent,
                timestamp: newMessage.timestamp,
              });
            }
            // Destinatário online → confirma entrega ao remetente
            if (senderSockets) {
              for (const socketId of senderSockets) {
                this.server.to(socketId).emit('message_delivered', {
                  conversation_id: data.conversationId,
                });
              }
            }
          }
        }
      }

      console.log(`[Socket] Mensagem emitida com sucesso para ${roomSize} cliente(s)`);
    } catch (err: any) {
      console.error(`[Socket] Erro ao enviar: ${err.message}`, err);
      client.emit('error', { message: err.message || 'Erro ao enviar' });
    }
  }

  // Emitido pelo receptor quando lê uma conversa (chat aberto ou clique "marcar como lida")
  @SubscribeMessage('ack_read')
  async handleAckRead(
    @MessageBody() data: { conversationId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    if (!client.user) return;
    // Zera unread_count no DynamoDB para que o inbox reflita a leitura
    await this.chatService.zeroUnreadCount(client.user.profile_id, data.conversationId);
    // Notifica o remetente que as mensagens foram lidas (double check)
    this.notifyMessagesRead(data.conversationId, client.user.profile_id);
  }

  /** Emite nova publicação para todos os clientes conectados */
  broadcastNewPost(post: { post_id: string; topic: string; subgroup?: string; profile_name: string; profile_id: string }) {
    this.server.emit('new_post', post);
  }

  /**
   * Emite new_message para a sala + inbox_update ao receptor (para msgs enviadas via HTTP,
   * como posts compartilhados, que não passam pelo handler send_message do WS)
   */
  emitNewMessage(conversationId: string, message: any, senderId: string) {
    const room = safeRoom(conversationId);
    this.server.to(room).emit('new_message', message);

    if (!conversationId.startsWith('GROUP#')) {
      const parts = conversationId.split('#');
      const recipientId = parts.find(id => id !== senderId);
      if (recipientId) {
        const recipientSockets = this.onlineUsers.get(recipientId);
        if (recipientSockets) {
          for (const socketId of recipientSockets) {
            this.server.to(socketId).emit('inbox_update', {
              conversation_id: conversationId,
              sender_name: message.sender_name,
              last_message: '📌 Publicação compartilhada',
              timestamp: message.timestamp,
            });
          }
          // Confirma entrega ao remetente
          const senderSockets = this.onlineUsers.get(senderId);
          if (senderSockets) {
            for (const socketId of senderSockets) {
              this.server.to(socketId).emit('message_delivered', { conversation_id: conversationId });
            }
          }
        }
      }
    }
  }

  /** Notifica usuário removido do grupo para que o app o redirecione */
  notifyKickedFromGroup(groupId: string, kickedProfileId: string) {
    const sockets = this.onlineUsers.get(kickedProfileId);
    if (!sockets) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit('kicked_from_group', { group_id: groupId });
    }
  }

  /**
   * Chamado pelo ChatController após getMessages para notificar o REMETENTE
   * que suas mensagens foram lidas pelo receptor.
   */
  notifyMessagesRead(conversationId: string, readerId: string) {
    if (conversationId.startsWith('GROUP#')) return;
    const parts = conversationId.split('#');
    const senderId = parts.find(id => id !== readerId);
    if (!senderId) return;

    const senderSockets = this.onlineUsers.get(senderId);
    if (!senderSockets) return;

    for (const socketId of senderSockets) {
      this.server.to(socketId).emit('messages_read', {
        conversation_id: conversationId,
        read_by: readerId,
      });
    }
    console.log(`[Socket] messages_read enviado para ${senderId} (lido por ${readerId})`);
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

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { CommunityService } from './community.service';
import { Community } from './schemas/community.schema';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class CommunityGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(private readonly communityService: CommunityService) {}

  async handleConnection(client: Socket) {
    const userId = client.handshake.auth?.token;
    if (!userId) {
      client.disconnect();
      return;
    }

    // 🔧 Cast explícito para o tipo Community
    const communities = (await this.communityService.getCommunitiesByUser(userId)) as Community[];

    for (const c of communities) {
      client.join(String(c._id)); // ✅ força o tipo como string
    }

    console.log(`🟢 ${userId} conectado e entrou em ${communities.length} comunidades.`);
  }

  @SubscribeMessage('joinCommunity')
  async onJoinCommunity(
    @MessageBody() data: { communityId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await this.communityService.addMember(data.communityId, data.userId);
    client.join(data.communityId);

    const messages = await this.communityService.getMessages(data.communityId);
    client.emit('previousMessages', messages);

    this.server.to(data.communityId).emit('systemMessage', {
      content: `${data.userId} entrou na comunidade.`,
    });
  }

  @SubscribeMessage('leaveCommunity')
  async onLeaveCommunity(
    @MessageBody() data: { communityId: string; userId: string },
    @ConnectedSocket() client: Socket,
  ) {
    await this.communityService.removeMember(data.communityId, data.userId);
    client.leave(data.communityId);

    this.server.to(data.communityId).emit('systemMessage', {
      content: `${data.userId} saiu da comunidade.`,
    });
  }

  @SubscribeMessage('message')
  async onMessage(
    @MessageBody()
    data: { communityId: string; authorId: string; content: string },
  ) {
    const savedMsg = await this.communityService.saveMessage(
      data.communityId,
      data.authorId,
      data.content,
    );

    this.server.to(data.communityId).emit('message', savedMsg);
  }
}

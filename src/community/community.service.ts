import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  DeleteCommand,
  UpdateCommand,
  ScanCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { CreateGroupDto } from './dto/community.dto';

interface AuthUser {
  profile_id: string;
  profile_name: string;
  profile_email: string;
  profile_nickname: string;
}

@Injectable()
export class CommunityService {
  private readonly groupsTable = 'CANDIGroups';
  private readonly groupMembersTable = 'CANDIGroupMembers';
  private readonly postsLikesTable = 'CANDIPostLikes';
  private readonly postsFavoritesTable = 'CANDIPostFavorites';
  private readonly postsTable = 'CANDIPosts';
  private readonly commentsTable = 'CANDIComments';

  private readonly messagesTable = 'CANDIMessages';
  private readonly conversationsTable = 'CANDIUserConversations';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  // ─── GRUPOS ────────────────────────────────────────────────────────────────

  async createGroup(user: AuthUser, dto: CreateGroupDto) {
    const groupId = randomUUID();
    const now = new Date().toISOString();

    const group = {
      group_id: groupId,
      name: dto.name,
      description: dto.description || '',
      topic: dto.topic?.toUpperCase() || 'GERAL',
      creator_id: user.profile_id,
      creator_name: user.profile_name,
      member_count: 1,
      created_at: now,
    };

    await this.db.send(new PutCommand({ TableName: this.groupsTable, Item: group }));

    // Auto-associa o criador como membro (admin)
    await this.db.send(
      new PutCommand({
        TableName: this.groupMembersTable,
        Item: {
          group_id: groupId,
          profile_id: user.profile_id,
          member_name: user.profile_nickname || user.profile_name,
          role: 'admin',
          joined_at: now,
        },
      }),
    );

    return group;
  }

  async listGroups(topic?: string) {
    if (topic) {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.groupsTable,
          IndexName: 'ByTopicGSI',
          KeyConditionExpression: 'topic = :t',
          ExpressionAttributeValues: { ':t': topic.toUpperCase() },
          ScanIndexForward: false,
        }),
      );
      return result.Items || [];
    }

    const result = await this.db.send(new ScanCommand({ TableName: this.groupsTable }));
    return (result.Items || []).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }

  async getGroup(groupId: string) {
    const result = await this.db.send(
      new GetCommand({ TableName: this.groupsTable, Key: { group_id: groupId } }),
    );
    if (!result.Item) throw new NotFoundException('Grupo não encontrado');
    return result.Item;
  }

  async joinGroup(user: AuthUser, groupId: string) {
    const group = await this.getGroup(groupId);

    // Verifica se já é membro
    const existing = await this.db.send(
      new GetCommand({
        TableName: this.groupMembersTable,
        Key: { group_id: groupId, profile_id: user.profile_id },
      }),
    );
    if (existing.Item) throw new ConflictException('Você já faz parte deste grupo');

    const now = new Date().toISOString();

    await this.db.send(
      new PutCommand({
        TableName: this.groupMembersTable,
        Item: {
          group_id: groupId,
          profile_id: user.profile_id,
          member_name: user.profile_nickname || user.profile_name,
          role: 'member',
          joined_at: now,
        },
      }),
    );

    // Incrementa o contador de membros
    await this.db.send(
      new UpdateCommand({
        TableName: this.groupsTable,
        Key: { group_id: groupId },
        UpdateExpression: 'SET member_count = if_not_exists(member_count, :init) + :inc',
        ExpressionAttributeValues: { ':inc': 1, ':init': 0 },
      }),
    );

    return { message: 'Você entrou no grupo com sucesso', group_id: groupId };
  }

  async leaveGroup(user: AuthUser, groupId: string) {
    const member = await this.db.send(
      new GetCommand({
        TableName: this.groupMembersTable,
        Key: { group_id: groupId, profile_id: user.profile_id },
      }),
    );
    if (!member.Item) throw new NotFoundException('Você não é membro deste grupo');
    if (member.Item.role === 'admin') {
      throw new ForbiddenException('Administradores não podem sair do grupo. Exclua o grupo.');
    }

    await this.db.send(
      new DeleteCommand({
        TableName: this.groupMembersTable,
        Key: { group_id: groupId, profile_id: user.profile_id },
      }),
    );

    await this.db.send(
      new UpdateCommand({
        TableName: this.groupsTable,
        Key: { group_id: groupId },
        UpdateExpression: 'SET member_count = member_count - :dec',
        ExpressionAttributeValues: { ':dec': 1 },
      }),
    );

    return { message: 'Você saiu do grupo' };
  }

  async getGroupMembers(groupId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.groupMembersTable,
        KeyConditionExpression: 'group_id = :gid',
        ExpressionAttributeValues: { ':gid': groupId },
      }),
    );
    return result.Items || [];
  }

  async getMyGroups(profileId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.groupMembersTable,
        IndexName: 'ByProfileGSI',
        KeyConditionExpression: 'profile_id = :pid',
        ExpressionAttributeValues: { ':pid': profileId },
      }),
    );
    return result.Items || [];
  }

  // ─── LIKES ──────────────────────────────────────────────────────────────────

  private async findPostByPostId(postId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :pk',
        FilterExpression: 'post_id = :pid',
        ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED', ':pid': postId },
      }),
    );
    return result.Items?.[0] ?? null;
  }

  async toggleLike(user: AuthUser, postId: string) {
    const likeKey = { post_id: postId, profile_id: user.profile_id };

    const existing = await this.db.send(
      new GetCommand({ TableName: this.postsLikesTable, Key: likeKey }),
    );

    if (existing.Item) {
      await this.db.send(new DeleteCommand({ TableName: this.postsLikesTable, Key: likeKey }));
      const count = await this.db.send(new QueryCommand({
        TableName: this.postsLikesTable,
        KeyConditionExpression: 'post_id = :pid',
        ExpressionAttributeValues: { ':pid': postId },
        Select: 'COUNT',
      }));
      return { liked: false, like_count: count.Count ?? 0 };
    }

    await this.db.send(
      new PutCommand({
        TableName: this.postsLikesTable,
        Item: { ...likeKey, liked_at: new Date().toISOString() },
      }),
    );
    const count = await this.db.send(new QueryCommand({
      TableName: this.postsLikesTable,
      KeyConditionExpression: 'post_id = :pid',
      ExpressionAttributeValues: { ':pid': postId },
      Select: 'COUNT',
    }));
    return { liked: true, like_count: count.Count ?? 1 };
  }

  async getPostLikes(postId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsLikesTable,
        KeyConditionExpression: 'post_id = :pid',
        ExpressionAttributeValues: { ':pid': postId },
        Select: 'COUNT',
      }),
    );
    return { post_id: postId, like_count: result.Count || 0 };
  }

  async getUserLikedPosts(profileId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsLikesTable,
        IndexName: 'ByProfileGSI',
        KeyConditionExpression: 'profile_id = :pid',
        ExpressionAttributeValues: { ':pid': profileId },
        ScanIndexForward: false,
      }),
    );
    return (result.Items || []).map((item) => item.post_id);
  }

  // ─── FAVORITOS ──────────────────────────────────────────────────────────────

  async toggleFavorite(user: AuthUser, postId: string) {
    const key = { profile_id: user.profile_id, post_id: postId };

    const existing = await this.db.send(
      new GetCommand({ TableName: this.postsFavoritesTable, Key: key }),
    );

    if (existing.Item) {
      await this.db.send(new DeleteCommand({ TableName: this.postsFavoritesTable, Key: key }));
      return { favorited: false, message: 'Post removido dos favoritos' };
    }

    await this.db.send(
      new PutCommand({
        TableName: this.postsFavoritesTable,
        Item: { ...key, created_at: new Date().toISOString() },
      }),
    );
    return { favorited: true, message: 'Post salvo nos favoritos' };
  }

  async getMyFavorites(profileId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsFavoritesTable,
        KeyConditionExpression: 'profile_id = :pid',
        ExpressionAttributeValues: { ':pid': profileId },
        ScanIndexForward: false,
      }),
    );
    return result.Items || [];
  }

  // ─── COMENTÁRIOS ────────────────────────────────────────────────────────────

  async addComment(user: AuthUser, postId: string, text: string) {
    const commentId = randomUUID();
    const comment = {
      post_id: postId,
      comment_id: commentId,
      profile_id: user.profile_id,
      author_name: user.profile_nickname || user.profile_name,
      text,
      created_at: new Date().toISOString(),
    };
    await this.db.send(new PutCommand({ TableName: this.commentsTable, Item: comment }));
    return comment;
  }

  async getComments(postId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.commentsTable,
        KeyConditionExpression: 'post_id = :pid',
        ExpressionAttributeValues: { ':pid': postId },
        ScanIndexForward: true,
      }),
    );
    return result.Items || [];
  }

  async deleteComment(user: AuthUser, postId: string, commentId: string) {
    const existing = await this.db.send(
      new GetCommand({ TableName: this.commentsTable, Key: { post_id: postId, comment_id: commentId } }),
    );
    if (!existing.Item) throw new NotFoundException('Comentário não encontrado');
    if (existing.Item.profile_id !== user.profile_id) throw new ForbiddenException('Sem permissão');
    await this.db.send(
      new DeleteCommand({ TableName: this.commentsTable, Key: { post_id: postId, comment_id: commentId } }),
    );
    return { message: 'Comentário excluído' };
  }

  async getMyFavoritedPosts(profileId: string) {
    const favs = await this.getMyFavorites(profileId);
    if (!favs.length) return [];

    const allPostsResult = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :pk',
        ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED' },
        ScanIndexForward: false,
      }),
    );

    const allPosts = allPostsResult.Items || [];
    const favIds = new Set(favs.map((f) => f.post_id));
    const favoritedPosts = allPosts.filter((p) => favIds.has(p.post_id));

    // Enriquecer com like_count e comment_count reais
    const enriched = await Promise.all(
      favoritedPosts.map(async (post) => {
        const [likesRes, commentsRes] = await Promise.all([
          this.db.send(new QueryCommand({
            TableName: this.postsLikesTable,
            KeyConditionExpression: 'post_id = :pid',
            ExpressionAttributeValues: { ':pid': post.post_id },
            Select: 'COUNT',
          })),
          this.db.send(new QueryCommand({
            TableName: this.commentsTable,
            KeyConditionExpression: 'post_id = :pid',
            ExpressionAttributeValues: { ':pid': post.post_id },
            Select: 'COUNT',
          })),
        ]);
        return { ...post, like_count: likesRes.Count ?? 0, comment_count: commentsRes.Count ?? 0 };
      }),
    );
    return enriched;
  }

  // ─── COMPARTILHAR POST PARA CHAT ────────────────────────────────────────────

  async sharePostToConversation(
    user: AuthUser,
    postId: string,
    conversationId: string,
  ) {
    const post = await this.findPostByPostId(postId);
    if (!post) throw new NotFoundException('Postagem não encontrada');

    const sharedPayload = {
      post_id: post.post_id,
      author_name: post.profile_name || 'Usuário',
      content: post.content,
      file_url: post.file_url || null,
      created_at: post.created_at,
      shared_by: user.profile_nickname || user.profile_name,
    };
    const sharedContent = `__POST__:${JSON.stringify(sharedPayload)}`;
    const now = new Date().toISOString();

    // Busca a entrada de conversa do usuário para obter o outro participante
    const convEntry = await this.db.send(new GetCommand({
      TableName: this.conversationsTable,
      Key: { profile_id: user.profile_id, conversation_id: conversationId },
    }));
    if (!convEntry.Item) throw new NotFoundException('Conversa não encontrada');

    const otherProfileId = convEntry.Item.other_user_id;

    await this.db.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: this.messagesTable,
            Item: {
              conversation_id: conversationId,
              timestamp: `${now}#${randomUUID()}`,
              sender_id: user.profile_id,
              sender_name: user.profile_nickname || user.profile_name,
              message_content: sharedContent,
            },
          },
        },
        {
          Update: {
            TableName: this.conversationsTable,
            Key: { profile_id: user.profile_id, conversation_id: conversationId },
            UpdateExpression: 'SET last_message = :msg, last_message_timestamp = :ts',
            ExpressionAttributeValues: { ':msg': '📌 Publicação compartilhada', ':ts': now },
          },
        },
        {
          Update: {
            TableName: this.conversationsTable,
            Key: { profile_id: otherProfileId, conversation_id: conversationId },
            UpdateExpression: 'SET last_message = :msg, last_message_timestamp = :ts, unread_count = if_not_exists(unread_count, :init) + :inc',
            ExpressionAttributeValues: { ':msg': '📌 Publicação compartilhada', ':ts': now, ':inc': 1, ':init': 0 },
          },
        },
      ],
    }));

    return { message: 'Post compartilhado com sucesso', conversation_id: conversationId };
  }
}

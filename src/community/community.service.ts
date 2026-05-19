import {
  Injectable,
  Inject,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
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
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { CreateGroupDto } from './dto/community.dto';
import { S3Provider } from '../s3/s3.provider';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import sharp = require('sharp');

type MemberRole = 'admin' | 'co-leader' | 'member' | 'pending';

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
  private readonly bucketName = process.env.AWS_S3_BUCKET_PROFILE || 'awscandi-image-uploads';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
    private readonly s3Provider: S3Provider,
  ) {}

  // ─── HELPERS ───────────────────────────────────────────────────────────────

  private async requireModRole(groupId: string, profileId: string): Promise<void> {
    const member = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: profileId },
    }));
    if (!member.Item || !['admin', 'co-leader'].includes(member.Item.role)) {
      throw new ForbiddenException('Apenas admin ou co-líder podem realizar esta ação');
    }
  }

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

    const existing = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: user.profile_id },
    }));
    if (existing.Item) {
      if (existing.Item.role === 'pending') throw new ConflictException('Sua solicitação já está pendente');
      throw new ConflictException('Você já faz parte deste grupo');
    }

    const now = new Date().toISOString();
    const requiresApproval = group.requires_approval === true;
    const role: MemberRole = requiresApproval ? 'pending' : 'member';

    await this.db.send(new PutCommand({
      TableName: this.groupMembersTable,
      Item: {
        group_id: groupId,
        profile_id: user.profile_id,
        member_name: user.profile_nickname || user.profile_name,
        role,
        joined_at: now,
      },
    }));

    if (!requiresApproval) {
      await this.db.send(new UpdateCommand({
        TableName: this.groupsTable,
        Key: { group_id: groupId },
        UpdateExpression: 'SET member_count = if_not_exists(member_count, :init) + :inc',
        ExpressionAttributeValues: { ':inc': 1, ':init': 0 },
      }));
    }

    return {
      message: requiresApproval ? 'Solicitação enviada, aguarde aprovação' : 'Você entrou no grupo com sucesso',
      status: role,
      group_id: groupId,
    };
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
    const members = result.Items || [];
    // Enriquece com nome do grupo
    const enriched = await Promise.all(members.map(async m => {
      try {
        const g = await this.db.send(new GetCommand({ TableName: this.groupsTable, Key: { group_id: m.group_id } }));
        return { ...m, group_name: g.Item?.name || '', topic: g.Item?.topic || '' };
      } catch { return m; }
    }));
    return enriched;
  }

  async getPendingRequests(user: AuthUser, groupId: string) {
    await this.requireModRole(groupId, user.profile_id);
    const result = await this.db.send(new QueryCommand({
      TableName: this.groupMembersTable,
      KeyConditionExpression: 'group_id = :gid',
      FilterExpression: '#r = :pending',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':gid': groupId, ':pending': 'pending' },
    }));
    return result.Items || [];
  }

  async handleJoinRequest(user: AuthUser, groupId: string, targetProfileId: string, action: 'approve' | 'reject') {
    await this.requireModRole(groupId, user.profile_id);

    const member = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: targetProfileId },
    }));
    if (!member.Item || member.Item.role !== 'pending') {
      throw new NotFoundException('Solicitação não encontrada');
    }

    if (action === 'reject') {
      await this.db.send(new DeleteCommand({
        TableName: this.groupMembersTable,
        Key: { group_id: groupId, profile_id: targetProfileId },
      }));
      return { message: 'Solicitação recusada' };
    }

    await this.db.send(new UpdateCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: targetProfileId },
      UpdateExpression: 'SET #r = :member',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':member': 'member' },
    }));
    await this.db.send(new UpdateCommand({
      TableName: this.groupsTable,
      Key: { group_id: groupId },
      UpdateExpression: 'SET member_count = if_not_exists(member_count, :init) + :inc',
      ExpressionAttributeValues: { ':inc': 1, ':init': 0 },
    }));
    return { message: 'Membro aprovado' };
  }

  async removeMember(user: AuthUser, groupId: string, targetProfileId: string) {
    await this.requireModRole(groupId, user.profile_id);

    const target = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: targetProfileId },
    }));
    if (!target.Item) throw new NotFoundException('Membro não encontrado');
    if (target.Item.role === 'admin') throw new ForbiddenException('Não é possível remover o administrador');

    // co-leader cannot remove another co-leader
    const caller = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: user.profile_id },
    }));
    if (caller.Item?.role === 'co-leader' && target.Item.role === 'co-leader') {
      throw new ForbiddenException('Co-líderes não podem remover outros co-líderes');
    }

    await this.db.send(new DeleteCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: targetProfileId },
    }));
    await this.db.send(new UpdateCommand({
      TableName: this.groupsTable,
      Key: { group_id: groupId },
      UpdateExpression: 'SET member_count = member_count - :dec',
      ExpressionAttributeValues: { ':dec': 1 },
    }));
    return { message: 'Membro removido' };
  }

  async updateMemberRole(user: AuthUser, groupId: string, targetProfileId: string, newRole: 'co-leader' | 'member') {
    // Only admin can promote
    const caller = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: user.profile_id },
    }));
    if (caller.Item?.role !== 'admin') throw new ForbiddenException('Apenas o administrador pode nomear co-líderes');

    const target = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: targetProfileId },
    }));
    if (!target.Item) throw new NotFoundException('Membro não encontrado');
    if (target.Item.role === 'admin') throw new ForbiddenException('Não é possível alterar o papel do administrador');

    await this.db.send(new UpdateCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: targetProfileId },
      UpdateExpression: 'SET #r = :role',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':role': newRole },
    }));
    return { message: newRole === 'co-leader' ? 'Co-líder nomeado' : 'Papel atualizado para membro' };
  }

  async deleteGroupPost(user: AuthUser, groupId: string, postId: string) {
    // Busca o post antes de checar permissão
    let post: any = null;
    for (const sg of [groupId, groupId.toUpperCase(), groupId.toLowerCase()]) {
      const r = await this.db.send(new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :pk',
        FilterExpression: 'post_id = :pid AND subgroup = :sg',
        ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED', ':pid': postId, ':sg': sg },
      }));
      if (r.Items?.[0]) { post = r.Items[0]; break; }
    }
    if (!post) throw new NotFoundException('Publicação não encontrada neste grupo');

    // Dono pode excluir a própria; mods podem excluir qualquer uma
    const isOwner = post.profile_id === user.profile_id;
    if (!isOwner) await this.requireModRole(groupId, user.profile_id);

    await this.db.send(new DeleteCommand({
      TableName: this.postsTable,
      Key: { profile_id: post.profile_id, post_id: post.post_id },
    }));
    return { message: 'Publicação removida' };
  }

  async updateGroup(user: AuthUser, groupId: string, dto: any) {
    const caller = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: user.profile_id },
    }));
    if (caller.Item?.role !== 'admin') throw new ForbiddenException('Apenas o administrador pode editar o grupo');

    const updateFields: string[] = [];
    const values: Record<string, any> = {};

    if (dto.name !== undefined) {
      updateFields.push('#n = :name');
      values[':name'] = dto.name;
    }
    if (dto.description !== undefined) {
      updateFields.push('#d = :desc');
      values[':desc'] = dto.description;
    }
    if (dto.topic !== undefined) {
      updateFields.push('topic = :topic');
      values[':topic'] = dto.topic.toUpperCase();
    }

    if (updateFields.length === 0) throw new BadRequestException('Nenhum campo para atualizar');

    await this.db.send(new UpdateCommand({
      TableName: this.groupsTable,
      Key: { group_id: groupId },
      UpdateExpression: `SET ${updateFields.join(', ')}`,
      ExpressionAttributeNames: { '#n': 'name', '#d': 'description' },
      ExpressionAttributeValues: values,
    }));

    const updated = await this.getGroup(groupId);
    return updated;
  }

  async deleteGroup(user: AuthUser, groupId: string) {
    const caller = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: user.profile_id },
    }));
    if (caller.Item?.role !== 'admin') throw new ForbiddenException('Apenas o administrador pode excluir o grupo');

    // Deleta todos os membros
    const membersResult = await this.db.send(new QueryCommand({
      TableName: this.groupMembersTable,
      KeyConditionExpression: 'group_id = :gid',
      ExpressionAttributeValues: { ':gid': groupId },
    }));
    await Promise.all((membersResult.Items || []).map(m =>
      this.db.send(new DeleteCommand({ TableName: this.groupMembersTable, Key: { group_id: groupId, profile_id: m.profile_id } }))
    ));

    // Deleta todas as mensagens do chat do grupo
    const msgsResult = await this.db.send(new QueryCommand({
      TableName: this.messagesTable,
      KeyConditionExpression: 'conversation_id = :cid',
      ExpressionAttributeValues: { ':cid': `GROUP#${groupId}` },
    }));
    await Promise.all((msgsResult.Items || []).map(m =>
      this.db.send(new DeleteCommand({ TableName: this.messagesTable, Key: { conversation_id: m.conversation_id, timestamp: m.timestamp } }))
    ));

    // Deleta o grupo
    await this.db.send(new DeleteCommand({ TableName: this.groupsTable, Key: { group_id: groupId } }));
    return { message: 'Grupo excluído com sucesso' };
  }

  async getMyMemberStatus(profileId: string, groupId: string) {
    const result = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: profileId },
    }));
    if (!result.Item) return { status: 'none' };
    return { status: result.Item.role, member: result.Item };
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

    const liked = !existing.Item;
    const delta = liked ? 1 : -1;

    if (existing.Item) {
      await this.db.send(new DeleteCommand({ TableName: this.postsLikesTable, Key: likeKey }));
    } else {
      await this.db.send(new PutCommand({
        TableName: this.postsLikesTable,
        Item: { ...likeKey, liked_at: new Date().toISOString() },
      }));
    }

    // Atualiza like_count atomicamente e retorna o novo valor diretamente
    try {
      const post = await this.findPostByPostId(postId);
      if (post) {
        const updated = await this.db.send(new UpdateCommand({
          TableName: this.postsTable,
          Key: { profile_id: post.profile_id, post_id: postId },
          UpdateExpression: 'ADD like_count :delta',
          ExpressionAttributeValues: { ':delta': delta },
          ReturnValues: 'UPDATED_NEW',
        }));
        const newCount = Math.max(0, (updated.Attributes?.like_count as number) ?? 0);
        return { liked, like_count: newCount };
      }
    } catch { /* fall through */ }

    // Fallback só se findPost falhar (não deveria acontecer)
    return { liked, like_count: liked ? 1 : 0 };
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
      author_name: user.profile_nickname || user.profile_name || user.profile_email?.split('@')[0] || 'Usuário',
      text,
      created_at: new Date().toISOString(),
    };
    await this.db.send(new PutCommand({ TableName: this.commentsTable, Item: comment }));
    // Incrementa comment_count no post atomicamente
    try {
      const post = await this.findPostByPostId(postId);
      if (post) {
        await this.db.send(new UpdateCommand({
          TableName: this.postsTable,
          Key: { profile_id: post.profile_id, post_id: postId },
          UpdateExpression: 'ADD comment_count :inc',
          ExpressionAttributeValues: { ':inc': 1 },
        }));
      }
    } catch { /* não bloqueia */ }
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

  async deleteComment(user: AuthUser, postId: string, commentId: string, groupId?: string) {
    const existing = await this.db.send(
      new GetCommand({ TableName: this.commentsTable, Key: { post_id: postId, comment_id: commentId } }),
    );
    if (!existing.Item) throw new NotFoundException('Comentário não encontrado');

    const isOwner = existing.Item.profile_id === user.profile_id;
    if (!isOwner) {
      if (groupId) {
        await this.requireModRole(groupId, user.profile_id); // lança ForbiddenException se não for mod
      } else {
        throw new ForbiddenException('Sem permissão');
      }
    }

    await this.db.send(
      new DeleteCommand({ TableName: this.commentsTable, Key: { post_id: postId, comment_id: commentId } }),
    );
    // Decrementa comment_count no post atomicamente
    try {
      const post = await this.findPostByPostId(postId);
      if (post) {
        await this.db.send(new UpdateCommand({
          TableName: this.postsTable,
          Key: { profile_id: post.profile_id, post_id: postId },
          UpdateExpression: 'ADD comment_count :dec',
          ExpressionAttributeValues: { ':dec': -1 },
          ConditionExpression: 'comment_count > :zero',
          ExpressionAttributeNames: undefined,
        })).catch(() => {}); // ignora se comment_count já for 0
      }
    } catch { /* não bloqueia */ }
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

  // ─── IMAGEM DE GRUPO ────────────────────────────────────────────────────────

  async uploadGroupImage(
    user: AuthUser,
    groupId: string,
    imageBuffer: Buffer,
    mimetype: string,
    type: 'photo' | 'banner',
  ) {
    const caller = await this.db.send(new GetCommand({
      TableName: this.groupMembersTable,
      Key: { group_id: groupId, profile_id: user.profile_id },
    }));
    if (caller.Item?.role !== 'admin') {
      throw new ForbiddenException('Apenas o administrador pode alterar imagens do grupo');
    }

    const dimensions = type === 'banner'
      ? { width: 1200, height: 400, fit: 'cover' as const }
      : { width: 400, height: 400, fit: 'cover' as const };

    let finalBuffer = imageBuffer;
    try {
      finalBuffer = await sharp(imageBuffer).resize(dimensions).webp({ quality: 80 }).toBuffer();
      mimetype = 'image/webp';
    } catch { /* fall through with original */ }

    const key = `groups/${groupId}-${type}.webp?v=${Date.now()}`;
    const cleanKey = `groups/${groupId}-${type}.webp`;
    await this.s3Provider.client.send(new PutObjectCommand({
      Bucket: this.bucketName,
      Key: cleanKey,
      Body: finalBuffer,
      ContentType: mimetype,
      ACL: 'public-read',
    }));

    const region = process.env.AWS_S3_REGION || process.env.AWS_REGION;
    const imageUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com/${cleanKey}?v=${Date.now()}`;
    const field = type === 'photo' ? 'photo_url' : 'banner_url';

    await this.db.send(new UpdateCommand({
      TableName: this.groupsTable,
      Key: { group_id: groupId },
      UpdateExpression: `SET ${field} = :url`,
      ExpressionAttributeValues: { ':url': imageUrl },
    }));

    const updated = await this.getGroup(groupId);
    return updated;
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

    const newMessage = {
      conversation_id: conversationId,
      timestamp: `${now}#${randomUUID()}`,
      sender_id: user.profile_id,
      sender_name: user.profile_nickname || user.profile_name,
      message_content: sharedContent,
    };

    // Chat de grupo: só persiste a mensagem, sem inbox
    if (conversationId.startsWith('GROUP#')) {
      await this.db.send(new PutCommand({ TableName: this.messagesTable, Item: newMessage }));
      return { message: 'Post compartilhado com sucesso', conversation_id: conversationId, newMessage };
    }

    // Chat 1:1: busca o outro participante e atualiza inbox
    const convEntry = await this.db.send(new GetCommand({
      TableName: this.conversationsTable,
      Key: { profile_id: user.profile_id, conversation_id: conversationId },
    }));
    if (!convEntry.Item) throw new NotFoundException('Conversa não encontrada');

    const otherProfileId = convEntry.Item.other_user_id;

    await this.db.send(new TransactWriteCommand({
      TransactItems: [
        { Put: { TableName: this.messagesTable, Item: newMessage } },
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

    return { message: 'Post compartilhado com sucesso', conversation_id: conversationId, newMessage };
  }
}

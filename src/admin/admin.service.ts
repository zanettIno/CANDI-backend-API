import { Injectable, Inject, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient, QueryCommand, ScanCommand,
  UpdateCommand, GetCommand, DeleteCommand, PutCommand,
} from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';

@Injectable()
export class AdminService {
  private readonly postsTable = 'CANDIPosts';
  private readonly reportsTable = 'CANDIReports';
  private readonly profileTable = process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile';
  private readonly BAN_THRESHOLD = 3;

  constructor(@Inject('DYNAMO_CLIENT') private readonly db: DynamoDBDocumentClient) {}

  // ── Dashboard / Stats ─────────────────────────────────────────────────────

  async getStats() {
    const [suspended, banned, reports] = await Promise.all([
      this.db.send(new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :pk',
        FilterExpression: '#s = :suspended',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED', ':suspended': 'suspended' },
        Select: 'COUNT',
      })),
      this.db.send(new ScanCommand({
        TableName: this.profileTable,
        FilterExpression: 'profile_status = :banned',
        ExpressionAttributeValues: { ':banned': 'banned' },
        Select: 'COUNT',
      })),
      this.db.send(new ScanCommand({
        TableName: this.reportsTable,
        Select: 'COUNT',
      })),
    ]);

    return {
      suspended_posts: suspended.Count ?? 0,
      banned_users: banned.Count ?? 0,
      total_reports: reports.Count ?? 0,
    };
  }

  // ── Posts suspensos com detalhes das denúncias ────────────────────────────

  async getSuspendedPosts() {
    // Busca posts com status=suspended OU com report_count >= 3 (posts antigos sem status)
    const result = await this.db.send(new QueryCommand({
      TableName: this.postsTable,
      IndexName: 'AllPostsGSI',
      KeyConditionExpression: 'feed_partition = :pk',
      FilterExpression: '#s = :suspended OR (attribute_not_exists(#s) AND report_count >= :threshold)',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED', ':suspended': 'suspended', ':threshold': 3 },
      ScanIndexForward: false,
    }));

    const posts = result.Items || [];

    // Busca as denúncias de cada post em paralelo
    const enriched = await Promise.all(posts.map(async post => {
      const reportsResult = await this.db.send(new QueryCommand({
        TableName: this.reportsTable,
        KeyConditionExpression: 'post_id = :pid',
        ExpressionAttributeValues: { ':pid': post.post_id },
      }));
      return { ...post, reports: reportsResult.Items || [] };
    }));

    return enriched.sort((a, b) => (b.reports.length || b.report_count || 0) - (a.reports.length || a.report_count || 0));
  }

  // Retorna TODOS os posts que têm ao menos 1 denúncia (independente de status)
  async getAllReports() {
    const reportsResult = await this.db.send(new ScanCommand({ TableName: this.reportsTable }));
    const reports = reportsResult.Items || [];

    // Agrupa por post_id
    const byPost: Record<string, any[]> = {};
    for (const r of reports) {
      if (!byPost[r.post_id]) byPost[r.post_id] = [];
      byPost[r.post_id].push(r);
    }

    // Busca os posts
    const postIds = Object.keys(byPost);
    const posts = await Promise.all(postIds.map(async postId => {
      const postResult = await this.db.send(new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :pk',
        FilterExpression: 'post_id = :pid',
        ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED', ':pid': postId },
      }));
      const post = postResult.Items?.[0];
      if (!post) return null;
      return { ...post, reports: byPost[postId] };
    }));

    return posts
      .filter(Boolean)
      .sort((a, b) => (b!.reports.length) - (a!.reports.length));
  }

  async approvePost(postId: string) {
    await this.db.send(new UpdateCommand({
      TableName: this.postsTable,
      Key: { post_id: postId },
      UpdateExpression: 'SET #s = :approved, report_count = :zero, reviewed_at = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':approved': 'approved', ':zero': 0, ':now': new Date().toISOString() },
    }));
    return { message: 'Publicação restaurada e marcada como aprovada (imune a denúncias).' };
  }

  async removePost(postId: string) {
    const post = await this.findPost(postId);
    if (!post) throw new NotFoundException('Publicação não encontrada');

    await this.db.send(new UpdateCommand({
      TableName: this.postsTable,
      Key: { post_id: postId },
      UpdateExpression: 'SET #s = :removed, removed_at = :now',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':removed': 'removed', ':now': new Date().toISOString() },
    }));

    const banUpdate = await this.db.send(new UpdateCommand({
      TableName: this.profileTable,
      Key: { profile_id: post.profile_id },
      UpdateExpression: 'ADD banned_posts_count :inc',
      ExpressionAttributeValues: { ':inc': 1 },
      ReturnValues: 'UPDATED_NEW',
    }));

    const bannedCount = (banUpdate.Attributes?.banned_posts_count as number) ?? 1;
    if (bannedCount >= this.BAN_THRESHOLD) {
      await this.db.send(new UpdateCommand({
        TableName: this.profileTable,
        Key: { profile_id: post.profile_id },
        UpdateExpression: 'SET profile_status = :banned, banned_at = :now',
        ExpressionAttributeValues: { ':banned': 'banned', ':now': new Date().toISOString() },
      }));
    }

    return { message: 'Publicação removida.', author_banned: bannedCount >= this.BAN_THRESHOLD, banned_posts_count: bannedCount };
  }

  // ── Usuários banidos ───────────────────────────────────────────────────────

  async getBannedUsers() {
    const result = await this.db.send(new ScanCommand({
      TableName: this.profileTable,
      FilterExpression: 'profile_status = :banned AND (#r = :patient OR attribute_not_exists(#r))',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':banned': 'banned', ':patient': 'patient' },
      ProjectionExpression: 'profile_id, profile_name, profile_email, banned_at, banned_posts_count',
    }));
    return (result.Items || []).sort((a, b) => (b.banned_at ?? '').localeCompare(a.banned_at ?? ''));
  }

  async unbanUser(userId: string) {
    await this.db.send(new UpdateCommand({
      TableName: this.profileTable,
      Key: { profile_id: userId },
      UpdateExpression: 'SET profile_status = :active REMOVE banned_at',
      ExpressionAttributeValues: { ':active': 'active' },
    }));
    return { message: 'Usuário desbanido.' };
  }

  // ── Gestão de admins ──────────────────────────────────────────────────────

  async getAdmins() {
    const result = await this.db.send(new ScanCommand({
      TableName: this.profileTable,
      FilterExpression: '#r = :admin',
      ExpressionAttributeNames: { '#r': 'role' },
      ExpressionAttributeValues: { ':admin': 'admin' },
      ProjectionExpression: 'profile_id, profile_name, profile_email, is_superadmin, created_at',
    }));
    return result.Items || [];
  }

  async createAdmin(data: { name: string; email: string; password: string }) {
    const existing = await this.db.send(new ScanCommand({
      TableName: this.profileTable,
      FilterExpression: 'profile_email = :email',
      ExpressionAttributeValues: { ':email': data.email },
    }));
    if (existing.Items?.length) throw new BadRequestException('E-mail já cadastrado');

    const hash = await bcrypt.hash(data.password, 10);
    const profileId = randomUUID();
    await this.db.send(new PutCommand({
      TableName: this.profileTable,
      Item: {
        profile_id: profileId,
        profile_name: data.name,
        profile_nickname: data.name,
        profile_email: data.email,
        profile_password: hash,
        role: 'admin',
        is_superadmin: false,
        profile_status: 'active',
        created_at: new Date().toISOString(),
      },
    }));
    return { message: 'Admin criado com sucesso.', profile_id: profileId };
  }

  async deleteAdmin(requesterId: string, targetId: string) {
    if (requesterId === targetId) throw new BadRequestException('Você não pode excluir sua própria conta');

    const requester = await this.db.send(new GetCommand({ TableName: this.profileTable, Key: { profile_id: requesterId } }));
    if (!requester.Item?.is_superadmin) throw new ForbiddenException('Apenas o superadmin pode excluir outros admins');

    const target = await this.db.send(new GetCommand({ TableName: this.profileTable, Key: { profile_id: targetId } }));
    if (!target.Item) throw new NotFoundException('Admin não encontrado');
    if (target.Item.is_superadmin) throw new ForbiddenException('Não é possível excluir o superadmin');

    await this.db.send(new DeleteCommand({ TableName: this.profileTable, Key: { profile_id: targetId } }));
    return { message: 'Admin excluído.' };
  }

  // ── Configurações do próprio admin ────────────────────────────────────────

  async updateMyCredentials(adminId: string, data: { email?: string; password?: string; current_password: string }) {
    const profile = await this.db.send(new GetCommand({ TableName: this.profileTable, Key: { profile_id: adminId } }));
    if (!profile.Item) throw new NotFoundException('Admin não encontrado');

    const valid = await bcrypt.compare(data.current_password, profile.Item.profile_password);
    if (!valid) throw new BadRequestException('Senha atual incorreta');

    const updates: string[] = [];
    const values: Record<string, any> = {};

    if (data.email?.trim()) {
      const existing = await this.db.send(new ScanCommand({
        TableName: this.profileTable,
        FilterExpression: 'profile_email = :email AND profile_id <> :id',
        ExpressionAttributeValues: { ':email': data.email.trim(), ':id': adminId },
      }));
      if (existing.Items?.length) throw new BadRequestException('E-mail já está em uso');
      updates.push('profile_email = :email');
      values[':email'] = data.email.trim();
    }

    if (data.password) {
      if (data.password.length < 6) throw new BadRequestException('Senha deve ter pelo menos 6 caracteres');
      updates.push('profile_password = :pwd');
      values[':pwd'] = await bcrypt.hash(data.password, 10);
    }

    if (!updates.length) throw new BadRequestException('Nenhum campo para atualizar');

    await this.db.send(new UpdateCommand({
      TableName: this.profileTable,
      Key: { profile_id: adminId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeValues: values,
    }));

    return { message: 'Credenciais atualizadas com sucesso.' };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  async getPostReports(postId: string) {
    const result = await this.db.send(new QueryCommand({
      TableName: this.reportsTable,
      KeyConditionExpression: 'post_id = :pid',
      ExpressionAttributeValues: { ':pid': postId },
    }));
    return result.Items || [];
  }

  private async findPost(postId: string) {
    const result = await this.db.send(new QueryCommand({
      TableName: this.postsTable,
      IndexName: 'AllPostsGSI',
      KeyConditionExpression: 'feed_partition = :pk',
      FilterExpression: 'post_id = :pid',
      ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED', ':pid': postId },
    }));
    return result.Items?.[0] ?? null;
  }
}

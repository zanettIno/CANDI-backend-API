import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  DynamoDBDocumentClient, QueryCommand, ScanCommand,
  UpdateCommand, GetCommand,
} from '@aws-sdk/lib-dynamodb';

@Injectable()
export class AdminService {
  private readonly postsTable = 'CANDIPosts';
  private readonly reportsTable = 'CANDIReports';
  private readonly profileTable = process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile';
  private readonly BAN_THRESHOLD = 3;

  constructor(@Inject('DYNAMO_CLIENT') private readonly db: DynamoDBDocumentClient) {}

  // ── Posts suspensos ────────────────────────────────────────────────────────

  async getSuspendedPosts() {
    const result = await this.db.send(new QueryCommand({
      TableName: this.postsTable,
      IndexName: 'AllPostsGSI',
      KeyConditionExpression: 'feed_partition = :pk',
      FilterExpression: '#s = :suspended',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pk': 'GLOBAL_FEED', ':suspended': 'suspended' },
      ScanIndexForward: false,
    }));
    return result.Items || [];
  }

  /** Aprova: restaura o post, marca como 'approved' (imune a novas denúncias) */
  async approvePost(postId: string) {
    await this.db.send(new UpdateCommand({
      TableName: this.postsTable,
      Key: { post_id: postId },
      UpdateExpression: 'SET #s = :approved, report_count = :zero',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':approved': 'approved', ':zero': 0 },
    }));
    return { message: 'Publicação restaurada e marcada como aprovada.' };
  }

  /** Remove definitivamente: incrementa banned_posts_count do autor, bane se >= 3 */
  async removePost(postId: string) {
    const post = await this.findPost(postId);
    if (!post) throw new NotFoundException('Publicação não encontrada');

    // Marca como removido
    await this.db.send(new UpdateCommand({
      TableName: this.postsTable,
      Key: { post_id: postId },
      UpdateExpression: 'SET #s = :removed',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':removed': 'removed' },
    }));

    // Incrementa banned_posts_count do autor
    const banUpdate = await this.db.send(new UpdateCommand({
      TableName: this.profileTable,
      Key: { profile_id: post.profile_id },
      UpdateExpression: 'ADD banned_posts_count :inc',
      ExpressionAttributeValues: { ':inc': 1 },
      ReturnValues: 'UPDATED_NEW',
    }));

    const bannedCount = (banUpdate.Attributes?.banned_posts_count as number) ?? 1;

    // Bane o usuário automaticamente se atingiu o threshold
    if (bannedCount >= this.BAN_THRESHOLD) {
      await this.db.send(new UpdateCommand({
        TableName: this.profileTable,
        Key: { profile_id: post.profile_id },
        UpdateExpression: 'SET profile_status = :banned, banned_at = :now',
        ExpressionAttributeValues: { ':banned': 'banned', ':now': new Date().toISOString() },
      }));
    }

    return {
      message: 'Publicação removida.',
      author_banned: bannedCount >= this.BAN_THRESHOLD,
      banned_posts_count: bannedCount,
    };
  }

  // ── Usuários banidos ───────────────────────────────────────────────────────

  async getBannedUsers() {
    const result = await this.db.send(new ScanCommand({
      TableName: this.profileTable,
      FilterExpression: 'profile_status = :banned',
      ExpressionAttributeValues: { ':banned': 'banned' },
      ProjectionExpression: 'profile_id, profile_name, profile_email, banned_at, banned_posts_count',
    }));
    return result.Items || [];
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

  // ── Denúncias de um post ──────────────────────────────────────────────────

  async getPostReports(postId: string) {
    const result = await this.db.send(new QueryCommand({
      TableName: this.reportsTable,
      KeyConditionExpression: 'post_id = :pid',
      ExpressionAttributeValues: { ':pid': postId },
    }));
    return result.Items || [];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

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

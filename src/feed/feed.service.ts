// src/feed/feed.service.ts
import { Injectable, Inject, InternalServerErrorException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { CreatePostDto } from './dto/feed.dto';
import { S3Provider } from '../s3/s3.provider';
// eslint-disable-next-line @typescript-eslint/no-var-requires
import sharp = require('sharp');

interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
  profile_name: string;
  profile_nickname: string;
}

export interface PaginatedFeed {
  items: any[];
  nextKey: string | null;
}

const PAGE_SIZE = 5;

@Injectable()
export class FeedService {
  private readonly postsTable = 'CANDIPosts';
  private readonly allPostsPartition = 'GLOBAL_FEED';
  private readonly bucketName = process.env.AWS_S3_BUCKET_PROFILE || 'awscandi-image-uploads';
  private readonly folderName = 'postagens/';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
    private readonly s3Provider: S3Provider,
  ) {}

  private extractHashtags(text: string): string[] {
    const matches = text.match(/#([a-zA-ZÀ-ú0-9_]+)/g) || [];
    return [...new Set(matches.map((t: string) => t.slice(1).toLowerCase()))];
  }

  private decodeLastKey(lastKey?: string): Record<string, any> | undefined {
    if (!lastKey) return undefined;
    try {
      return JSON.parse(Buffer.from(lastKey, 'base64').toString('utf-8'));
    } catch {
      return undefined;
    }
  }

  private encodeLastKey(key?: Record<string, any>): string | null {
    if (!key) return null;
    return Buffer.from(JSON.stringify(key)).toString('base64');
  }

  private async compressImage(buffer: Buffer, mimetype: string, originalName: string) {
    if (!mimetype.startsWith('image/') || mimetype === 'image/gif') {
      return { buffer, mimetype, originalName };
    }
    try {
      const compressed = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      return {
        buffer: compressed,
        mimetype: 'image/webp',
        originalName: originalName.replace(/\.[^.]+$/, '') + '.webp',
      };
    } catch {
      return { buffer, mimetype, originalName };
    }
  }

  async createPost(
    user: AuthenticatedUser,
    dto: CreatePostDto,
    topic: string = 'GERAL',
    file?: { buffer: Buffer; mimetype: string; originalName: string },
    subgroup?: string,
  ) {
    const postId = randomUUID();
    const normalizedTopic = topic.toUpperCase().trim() || 'GERAL';
    const normalizedSubgroup = subgroup?.toUpperCase().trim();
    const hashtags = this.extractHashtags(dto.content);
    let fileUrl: string | null = null;

    if (file) {
      const processed = await this.compressImage(file.buffer, file.mimetype, file.originalName);
      const safeName = processed.originalName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._\-]/g, '');
      const fileKey = `${this.folderName}${postId}-${safeName}`;
      try {
        await this.s3Provider.client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
            Body: processed.buffer,
            ContentType: processed.mimetype,
          }),
        );
        const region = process.env.AWS_S3_REGION || process.env.AWS_REGION;
        fileUrl = `https://${this.bucketName}.s3.${region}.amazonaws.com/${fileKey}`;
      } catch (error) {
        console.error('Erro ao fazer upload para S3:', error);
        throw new InternalServerErrorException('Não foi possível salvar o arquivo da postagem.');
      }
    }

    const newPost = {
      post_id: postId,
      profile_id: user.profile_id,
      profile_name: user.profile_name || user.profile_email,
      ...(user.profile_nickname && { profile_nickname: user.profile_nickname }),
      content: dto.content,
      ...(fileUrl && { file_url: fileUrl }),
      created_at: new Date().toISOString(),
      topic: normalizedTopic,
      ...(normalizedSubgroup && { subgroup: normalizedSubgroup }),
      ...(hashtags.length && { hashtags }),
      feed_partition: this.allPostsPartition,
    };

    try {
      await this.db.send(new PutCommand({ TableName: this.postsTable, Item: newPost }));
    } catch (error) {
      console.error('Erro ao salvar no DynamoDB:', error, newPost);
      throw new InternalServerErrorException('Não foi possível salvar a postagem no banco de dados.');
    }

    return { message: 'Postagem publicada com sucesso', post: newPost };
  }

  async getPostsBySubgroup(subgroup: string, limit = PAGE_SIZE, lastKey?: string): Promise<PaginatedFeed> {
    const normalizedSubgroup = subgroup.toUpperCase().trim();
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'BySubgroupGSI',
        KeyConditionExpression: 'subgroup = :sg',
        ExpressionAttributeValues: { ':sg': normalizedSubgroup },
        ScanIndexForward: false,
        Limit: limit,
        ...(this.decodeLastKey(lastKey) && { ExclusiveStartKey: this.decodeLastKey(lastKey) }),
      }),
    );
    const items = await this.enrichPostsWithCounts(this.filterActive(result.Items || []));
    return { items, nextKey: this.encodeLastKey(result.LastEvaluatedKey) };
  }

  // Filtra posts suspensos ou removidos — só admin vê
  private filterActive(posts: any[]): any[] {
    return posts.filter(p => !p.status || p.status === 'active' || p.status === 'approved');
  }

  private async enrichPostsWithCounts(posts: any[]): Promise<any[]> {
    if (!posts.length) return [];
    const commentsTable = 'CANDIComments';
    const likesTable = 'CANDIPostLikes';

    return Promise.all(
      posts.map(async (post) => {
        // Usa valores atômicos armazenados no post quando disponíveis (posts novos/interagidos).
        // Para posts antigos (sem os campos), faz COUNT no DynamoDB como fallback.
        const hasStoredLike = post.like_count !== undefined && post.like_count !== null;
        const hasStoredComment = post.comment_count !== undefined && post.comment_count !== null;

        const queries: Promise<any>[] = [];
        if (!hasStoredLike) queries.push(
          this.db.send(new QueryCommand({
            TableName: likesTable,
            KeyConditionExpression: 'post_id = :pid',
            ExpressionAttributeValues: { ':pid': post.post_id },
            Select: 'COUNT',
          }))
        );
        if (!hasStoredComment) queries.push(
          this.db.send(new QueryCommand({
            TableName: commentsTable,
            KeyConditionExpression: 'post_id = :pid',
            ExpressionAttributeValues: { ':pid': post.post_id },
            Select: 'COUNT',
          }))
        );

        const results = await Promise.all(queries);
        let qi = 0;
        const likeCount = hasStoredLike
          ? Math.max(0, post.like_count as number)
          : (results[qi++]?.Count ?? 0);
        const commentCount = hasStoredComment
          ? Math.max(0, post.comment_count as number)
          : (results[qi]?.Count ?? 0);

        return { ...post, like_count: likeCount, comment_count: commentCount };
      }),
    );
  }

  async searchByHashtag(tag: string, limit = PAGE_SIZE, lastKey?: string): Promise<PaginatedFeed> {
    const normalized = tag.toLowerCase().replace(/^#/, '');
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :p',
        FilterExpression: 'contains(hashtags, :tag)',
        ExpressionAttributeValues: { ':p': this.allPostsPartition, ':tag': normalized },
        ScanIndexForward: false,
        Limit: Math.max(limit * 4, 20),
        ...(this.decodeLastKey(lastKey) && { ExclusiveStartKey: this.decodeLastKey(lastKey) }),
      }),
    );
    const items = await this.enrichPostsWithCounts(this.filterActive(result.Items || []));
    return { items, nextKey: this.encodeLastKey(result.LastEvaluatedKey) };
  }

  async getPostsByTopic(topic: string, limit = PAGE_SIZE, lastKey?: string): Promise<PaginatedFeed> {
    const normalizedTopic = topic.toUpperCase().trim();
    if (!normalizedTopic || normalizedTopic === 'FEED') {
      return this.getGlobalFeed(limit, lastKey);
    }
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'ByTopicGSI',
        KeyConditionExpression: 'topic = :t',
        FilterExpression: 'attribute_not_exists(subgroup)',
        ExpressionAttributeValues: { ':t': normalizedTopic },
        ScanIndexForward: false,
        Limit: Math.max(limit * 4, 20),
        ...(this.decodeLastKey(lastKey) && { ExclusiveStartKey: this.decodeLastKey(lastKey) }),
      }),
    );
    const items = await this.enrichPostsWithCounts(this.filterActive(result.Items || []));
    return { items, nextKey: this.encodeLastKey(result.LastEvaluatedKey) };
  }

  async deletePost(profileId: string, postId: string) {
    const result = await this.db.send(new QueryCommand({
      TableName: this.postsTable,
      IndexName: 'AllPostsGSI',
      KeyConditionExpression: 'feed_partition = :pk',
      FilterExpression: 'post_id = :pid',
      ExpressionAttributeValues: { ':pk': this.allPostsPartition, ':pid': postId },
    }));
    const post = result.Items?.[0];
    if (!post) throw new NotFoundException('Publicação não encontrada');
    if (post.profile_id !== profileId) throw new ForbiddenException('Você não pode excluir esta publicação');

    await this.db.send(new DeleteCommand({
      TableName: this.postsTable,
      Key: { post_id: post.post_id },
    }));

    return { message: 'Publicação excluída com sucesso' };
  }

  async getGlobalFeed(limit = PAGE_SIZE, lastKey?: string): Promise<PaginatedFeed> {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :p',
        FilterExpression: 'attribute_not_exists(subgroup)',
        ExpressionAttributeValues: { ':p': this.allPostsPartition },
        ScanIndexForward: false,
        Limit: Math.max(limit * 4, 20),
        ...(this.decodeLastKey(lastKey) && { ExclusiveStartKey: this.decodeLastKey(lastKey) }),
      }),
    );
    const items = await this.enrichPostsWithCounts(this.filterActive(result.Items || []));
    return { items, nextKey: this.encodeLastKey(result.LastEvaluatedKey) };
  }
}

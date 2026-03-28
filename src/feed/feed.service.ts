// src/feed/feed.service.ts
import { Injectable, Inject, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand, UpdateCommand, GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { CreatePostDto, Comment, LikeResponse } from './dto/feed.dto';
import { S3Provider } from '../s3/s3.provider'; 

interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
  profile_name: string;
  profile_nickname: string; // Mesmo que não exista, o tipo espera
}

@Injectable()
export class FeedService {
  private readonly postsTable = 'CANDIPosts';
  private readonly likesTable = 'CANDIPostLikes';
  private readonly commentsTable = 'CANDIPostComments';
  private readonly savedPostsTable = 'CANDIUserSavedPosts';
  private readonly allPostsPartition = 'GLOBAL_FEED';
  private readonly bucketName = process.env.AWS_S3_BUCKET_FILE || 'candi-file-uploads';
  private readonly imageFolder = 'posts-image/'; // Pasta específica para imagens de posts 

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
    private readonly s3Provider: S3Provider,
  ) {}

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
    let fileName: string | null = null;
    let isImage = false;

    // 1. Upload do Arquivo (se existir)
    if (file) {
      isImage = true;
      const fileKey = `${this.imageFolder}${postId}-${file.originalName}`;
      try {
        await this.s3Provider.client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );
        // Salva apenas o nome do arquivo, não a URL inteira
        fileName = `${postId}-${file.originalName}`;
      } catch (error) {
        console.error('Erro ao fazer upload para S3:', error);
        throw new InternalServerErrorException('Não foi possível salvar o arquivo da postagem.');
      }
    }

    // 2. Salva o Post no DynamoDB com novo schema
    const now = new Date().toISOString();
    const newPost = {
      post_id: postId,
      profile_id: user.profile_id,
      profile_name: user.profile_name || user.profile_email,
      content: dto.content,
      created_at: now,
      topic: normalizedTopic,
      ...(normalizedSubgroup && { subgroup: normalizedSubgroup }),
      feed_partition: this.allPostsPartition,
      // Novo schema conforme solicitado
      is_image: isImage,
      ...(fileName && { file_name: fileName }),
      likes: [], // Array vazio inicialmente
      likes_count: 0,
      comments_count: 0,
    };

    try {
      await this.db.send(
        new PutCommand({
          TableName: this.postsTable,
          Item: newPost,
        }),
      );
    } catch (error) {
        console.error('Erro ao salvar no DynamoDB:', error, newPost);
        throw new InternalServerErrorException('Não foi possível salvar a postagem no banco de dados.');
    }

    return { message: 'Postagem publicada com sucesso', post: newPost };
  }

  // ===================================================================
  // <<< NOVA FUNÇÃO ADICIONADA AQUI >>>
  // ===================================================================
  async getPostsBySubgroup(subgroup: string) {
    const normalizedSubgroup = subgroup.toUpperCase().trim();
    
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        // 1. USA O NOVO ÍNDICE
        IndexName: 'BySubgroupGSI', 
        // 2. BUSCA PELA PK 'subgroup'
        KeyConditionExpression: 'subgroup = :sg', 
        ExpressionAttributeValues: { ':sg': normalizedSubgroup },
        // 3. Ordena do mais novo pro mais velho
        ScanIndexForward: false, 
      }),
    );

    return result.Items || [];
  }
  // ===================================================================

  async getPostsByTopic(topic: string) {
    const normalizedTopic = topic.toUpperCase().trim();
    if (!normalizedTopic || normalizedTopic === 'FEED') { // Trata 'FEED' como global
        return this.getGlobalFeed();
    }
    
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'ByTopicGSI',
        KeyConditionExpression: 'topic = :t',
        ExpressionAttributeValues: { ':t': normalizedTopic },
        ScanIndexForward: false,
      }),
    );

    return result.Items || [];
  }

  async getGlobalFeed() {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.postsTable,
        IndexName: 'AllPostsGSI',
        KeyConditionExpression: 'feed_partition = :p',
        ExpressionAttributeValues: { ':p': this.allPostsPartition },
        ScanIndexForward: false,
      }),
    );

    return result.Items || [];
  }

  /**
   * Toggle like on a post (add or remove like)
   * Returns { liked: boolean, count: number }
   */
  async toggleLike(
    postId: string,
    userId: string,
  ): Promise<LikeResponse> {
    try {
      // 1. Check if post exists
      const postResult = await this.db.send(
        new GetCommand({
          TableName: this.postsTable,
          Key: { post_id: postId },
        }),
      );

      if (!postResult.Item) {
        throw new BadRequestException('Post não encontrado');
      }

      // 2. Check if user already liked this post
      const likeResult = await this.db.send(
        new GetCommand({
          TableName: this.likesTable,
          Key: { post_id: postId, profile_id: userId },
        }),
      );

      const userAlreadyLiked = !!likeResult.Item;

      // 3. Toggle like
      const post = postResult.Item as any;
      const currentLikes = post.likes || [];
      const userIndex = currentLikes.indexOf(userId);
      const userAlreadyLikedInArray = userIndex >= 0;

      if (userAlreadyLiked) {
        // Remove like from both tables
        await this.db.send(
          new DeleteCommand({
            TableName: this.likesTable,
            Key: { post_id: postId, profile_id: userId },
          }),
        );
        // Remove from likes array
        currentLikes.splice(userIndex, 1);
      } else {
        // Add like to both tables
        await this.db.send(
          new PutCommand({
            TableName: this.likesTable,
            Item: {
              post_id: postId,
              profile_id: userId,
              created_at: new Date().toISOString(),
            },
          }),
        );
        // Add to likes array
        currentLikes.push(userId);
      }

      // 4. Update like count and array on post
      const newLiked = !userAlreadyLiked;
      const newCount = currentLikes.length;

      await this.db.send(
        new UpdateCommand({
          TableName: this.postsTable,
          Key: { post_id: postId },
          UpdateExpression: 'SET likes_count = :count, likes = :likes',
          ExpressionAttributeValues: {
            ':count': newCount,
            ':likes': currentLikes.length > 0 ? new Set(currentLikes) : new Set(),
          },
        }),
      );

      return {
        liked: newLiked,
        count: newCount,
      };
    } catch (error) {
      console.error('Erro ao fazer toggle like:', error);
      throw new InternalServerErrorException('Erro ao processar like');
    }
  }

  /**
   * Add comment to a post
   */
  async addComment(
    postId: string,
    userId: string,
    userName: string,
    content: string,
  ): Promise<Comment> {
    try {
      // 1. Check if post exists
      const postResult = await this.db.send(
        new GetCommand({
          TableName: this.postsTable,
          Key: { post_id: postId },
        }),
      );

      if (!postResult.Item) {
        throw new BadRequestException('Post não encontrado');
      }

      // 2. Create comment
      const commentId = randomUUID();
      const now = new Date().toISOString();

      const comment: Comment = {
        comment_id: commentId,
        post_id: postId,
        profile_id: userId,
        profile_name: userName,
        content,
        created_at: now,
      };

      // 3. Save comment to CANDIPostComments table
      await this.db.send(
        new PutCommand({
          TableName: this.commentsTable,
          Item: {
            comment_id: commentId,
            post_id: postId,
            profile_id: userId,
            profile_name: userName,
            content,
            created_at: now,
          },
        }),
      );

      // 4. Increment comment count on post
      const currentCount = (postResult.Item as any).comments_count || 0;
      const newCount = currentCount + 1;

      await this.db.send(
        new UpdateCommand({
          TableName: this.postsTable,
          Key: { post_id: postId },
          UpdateExpression: 'SET comments_count = :count',
          ExpressionAttributeValues: { ':count': newCount },
        }),
      );

      return comment;
    } catch (error) {
      console.error('Erro ao adicionar comentário:', error);
      throw new InternalServerErrorException('Erro ao adicionar comentário');
    }
  }

  /**
   * Get all comments for a post
   */
  async getComments(postId: string, limit: number = 20): Promise<Comment[]> {
    try {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.commentsTable,
          KeyConditionExpression: 'post_id = :postId',
          ExpressionAttributeValues: { ':postId': postId },
          ScanIndexForward: false, // Most recent first
          Limit: limit,
        }),
      );

      return result.Items as Comment[];
    } catch (error) {
      console.error('Erro ao buscar comentários:', error);
      throw new InternalServerErrorException('Erro ao buscar comentários');
    }
  }

  /**
   * Delete a comment (only by author)
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    try {
      // 1. Get comment to verify author
      const commentResult = await this.db.send(
        new QueryCommand({
          TableName: this.commentsTable,
          IndexName: 'comment_id-created_at', // Assuming this GSI exists
          KeyConditionExpression: 'comment_id = :commentId',
          ExpressionAttributeValues: { ':commentId': commentId },
        }),
      );

      const comment = commentResult.Items?.[0] as any;
      if (!comment) {
        throw new BadRequestException('Comentário não encontrado');
      }

      // 2. Verify user is the author
      if (comment.profile_id !== userId) {
        throw new BadRequestException('Você não tem permissão para deletar este comentário');
      }

      // 3. Delete comment
      await this.db.send(
        new DeleteCommand({
          TableName: this.commentsTable,
          Key: { comment_id: commentId, post_id: comment.post_id },
        }),
      );

      // 4. Decrement comment count on post
      const postResult = await this.db.send(
        new GetCommand({
          TableName: this.postsTable,
          Key: { post_id: comment.post_id },
        }),
      );

      const currentCount = (postResult.Item as any).comments_count || 0;
      const newCount = Math.max(currentCount - 1, 0);

      await this.db.send(
        new UpdateCommand({
          TableName: this.postsTable,
          Key: { post_id: comment.post_id },
          UpdateExpression: 'SET comments_count = :count',
          ExpressionAttributeValues: { ':count': newCount },
        }),
      );
    } catch (error) {
      console.error('Erro ao deletar comentário:', error);
      throw new InternalServerErrorException('Erro ao deletar comentário');
    }
  }

  /**
   * Check if user liked a post
   */
  async checkUserLike(postId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db.send(
        new GetCommand({
          TableName: this.likesTable,
          Key: { post_id: postId, profile_id: userId },
        }),
      );

      return !!result.Item;
    } catch (error) {
      console.error('Erro ao verificar like:', error);
      return false;
    }
  }

  /**
   * Save/favorite a post for user
   */
  async savePost(postId: string, userId: string): Promise<void> {
    try {
      // 1. Check if post exists
      const postResult = await this.db.send(
        new GetCommand({
          TableName: this.postsTable,
          Key: { post_id: postId },
        }),
      );

      if (!postResult.Item) {
        throw new BadRequestException('Post não encontrado');
      }

      // 2. Check if already saved
      const savedResult = await this.db.send(
        new GetCommand({
          TableName: this.savedPostsTable,
          Key: { profile_id: userId, post_id: postId },
        }),
      );

      if (savedResult.Item) {
        throw new BadRequestException('Este post já foi salvo');
      }

      // 3. Save the post
      const now = new Date().toISOString();
      const post = postResult.Item as any;

      await this.db.send(
        new PutCommand({
          TableName: this.savedPostsTable,
          Item: {
            profile_id: userId,
            post_id: postId,
            saved_at: now,
            // Store minimal post data for quick display
            post_data: {
              post_id: post.post_id,
              profile_id: post.profile_id,
              profile_name: post.profile_name,
              content: post.content,
              file_url: post.file_url,
              created_at: post.created_at,
              topic: post.topic,
            },
          },
        }),
      );
    } catch (error) {
      console.error('Erro ao salvar post:', error);
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Erro ao salvar post');
    }
  }

  /**
   * Remove saved post
   */
  async unsavePost(postId: string, userId: string): Promise<void> {
    try {
      await this.db.send(
        new DeleteCommand({
          TableName: this.savedPostsTable,
          Key: { profile_id: userId, post_id: postId },
        }),
      );
    } catch (error) {
      console.error('Erro ao remover post salvo:', error);
      throw new InternalServerErrorException('Erro ao remover post salvo');
    }
  }

  /**
   * Get all saved posts for user
   */
  async getSavedPosts(userId: string): Promise<any[]> {
    try {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.savedPostsTable,
          KeyConditionExpression: 'profile_id = :userId',
          ExpressionAttributeValues: { ':userId': userId },
          ScanIndexForward: false, // Most recent first
        }),
      );

      // Return the saved posts with their stored data
      return (result.Items || []).map((item: any) => item.post_data || item);
    } catch (error) {
      console.error('Erro ao buscar posts salvos:', error);
      throw new InternalServerErrorException('Erro ao buscar posts salvos');
    }
  }

  /**
   * Check if user saved a post
   */
  async checkUserSave(postId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db.send(
        new GetCommand({
          TableName: this.savedPostsTable,
          Key: { profile_id: userId, post_id: postId },
        }),
      );

      return !!result.Item;
    } catch (error) {
      console.error('Erro ao verificar post salvo:', error);
      return false;
    }
  }

  /**
   * Get posts for a specific group (using subgroup field as group_id)
   */
  async getGroupPosts(groupId: string): Promise<any[]> {
    try {
      const normalizedGroupId = groupId.toUpperCase().trim();

      const result = await this.db.send(
        new QueryCommand({
          TableName: this.postsTable,
          IndexName: 'BySubgroupGSI',
          KeyConditionExpression: 'subgroup = :groupId',
          ExpressionAttributeValues: { ':groupId': normalizedGroupId },
          ScanIndexForward: false, // Most recent first
        }),
      );

      return result.Items || [];
    } catch (error) {
      console.error('Erro ao buscar posts do grupo:', error);
      throw new InternalServerErrorException('Erro ao buscar posts do grupo');
    }
  }
}
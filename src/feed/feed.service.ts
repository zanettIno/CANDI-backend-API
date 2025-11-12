// src/feed/feed.service.ts
import { Injectable, Inject, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { CreatePostDto } from './dto/feed.dto';
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
  private readonly allPostsPartition = 'GLOBAL_FEED';
  private readonly bucketName = process.env.AWS_S3_BUCKET_FILE || 'candi-file-uploads';
  private readonly folderName = 'postagens/'; 

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
    subgroup?: string, // 1. RECEBE O NOVO PARÂMETRO AQUI
  ) {
    const postId = randomUUID();
    const normalizedTopic = topic.toUpperCase().trim() || 'GERAL';
    const normalizedSubgroup = subgroup?.toUpperCase().trim(); // 2. NORMALIZA O SUBGRUPO
    let fileUrl: string | null = null; // Inicia como null (seguro para DynamoDB)

    // 1. Upload do Arquivo (se existir)
    if (file) {
      const fileKey = `${this.folderName}${postId}-${file.originalName}`;
      try {
        await this.s3Provider.client.send(
          new PutObjectCommand({
            Bucket: this.bucketName,
            Key: fileKey,
            Body: file.buffer,
            ContentType: file.mimetype,
          }),
        );
        fileUrl = `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${fileKey}`;
      } catch (error) {
        console.error('Erro ao fazer upload para S3:', error);
        throw new InternalServerErrorException('Não foi possível salvar o arquivo da postagem.');
      }
    }

    // 2. Salva o Post no DynamoDB
    const newPost = {
      post_id: postId,
      profile_id: user.profile_id,
      profile_name: user.profile_name || user.profile_email,
      content: dto.content,
      ...(fileUrl && { file_url: fileUrl }), 
      created_at: new Date().toISOString(),
      topic: normalizedTopic,
      // 3. SALVA O SUBGRUPO (SE ELE EXISTIR)
      ...(normalizedSubgroup && { subgroup: normalizedSubgroup }),
      feed_partition: this.allPostsPartition, 
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
}
// src/diary/diary.service.ts
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { S3Provider } from '../s3/s3.provider';
import { Readable } from 'stream';

@Injectable()
export class DiaryService {
  private readonly bucketName = process.env.AWS_S3_BUCKET_FILE || 'candi-file-uploads';
  private readonly folderName = 'diary/';

  constructor(private readonly s3Provider: S3Provider) {}

  private getKey(userId: string, date: string): string {
    return `${this.folderName}${userId}-${date}.txt`;
  }

  private async streamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
  }

  async createDiary(userId: string, date: string, content: string) {
    const key = this.getKey(userId, date);

    try {
      // verificar se já existe
      await this.s3Provider.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      throw new BadRequestException('Já existe um diário para esta data');
    } catch (err: any) {
      if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
        throw new InternalServerErrorException('Erro ao verificar diário existente');
      }
    }

    try {
      await this.s3Provider.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: content,
          ContentType: 'text/plain; charset=utf-8',
        }),
      );
      return {
        message: 'Diário criado com sucesso',
        filePath: key,
        url: `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
      };
    } catch (err) {
      throw new InternalServerErrorException('Erro ao criar o diário');
    }
  }

  async getDiary(userId: string, date: string) {
    const key = this.getKey(userId, date);

    try {
      const result = await this.s3Provider.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      const content = await this.streamToString(result.Body as Readable);
      return {
        date,
        content,
      };
    } catch (err: any) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('Diário não encontrado');
      }
      throw new InternalServerErrorException('Erro ao buscar o diário');
    }
  }

  async updateDiary(userId: string, date: string, content: string) {
    const key = this.getKey(userId, date);

    try {
      await this.s3Provider.client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
    } catch (err: any) {
      if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
        throw new NotFoundException('Diário não encontrado');
      }
      throw new InternalServerErrorException('Erro ao validar o diário existente');
    }

    try {
      await this.s3Provider.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: content,
          ContentType: 'text/plain; charset=utf-8',
        }),
      );

      return {
        message: 'Diário atualizado com sucesso',
        filePath: key,
      };
    } catch {
      throw new InternalServerErrorException('Erro ao atualizar o diário');
    }
  }

  async deleteDiary(userId: string, date: string) {
    const key = this.getKey(userId, date);

    try {
      await this.s3Provider.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );

      return {
        message: 'Diário deletado com sucesso',
        filePath: key,
      };
    } catch {
      throw new InternalServerErrorException('Erro ao deletar o diário');
    }
  }
async listDiaries(userId: string) {
  const command = new ListObjectsV2Command({
    Bucket: this.bucketName,
    Prefix: `${this.folderName}${userId}-`, // garante que só traz arquivos do usuário
  });

  const response = await this.s3Provider.client.send(command);
  if (!response.Contents || response.Contents.length === 0) return [];

  const diaries = await Promise.all(
    response.Contents.map(async (item) => {
      const key = item.Key!;
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const file = await this.s3Provider.client.send(getCommand);
      const body = await this.streamToString(file.Body as Readable);

      // Extrai apenas o trecho final (ex: 2025-10-27.txt -> 2025-10-27)
      const match = key.match(/(\d{4}-\d{2}-\d{2})\.txt$/);
      const date = match ? match[1] : 'unknown';

      return {
        date,
        content: body,
      };
    }),
  );

return diaries.sort((a, b) => (a.date > b.date ? 1 : -1));

}



}

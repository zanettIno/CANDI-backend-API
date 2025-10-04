// src/s3/profile-image.service.ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { S3Provider } from './s3.provider';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';

@Injectable()
export class ProfileImageService {
  private bucketName = process.env.AWS_S3_BUCKET_PROFILE || 'candi-image-uploads';

  constructor(private readonly s3Provider: S3Provider) {}

  async uploadProfileImage(profileId: string, fileBuffer: Buffer, mimetype: string) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(mimetype)) {
      throw new BadRequestException('Tipo de arquivo não permitido');
    }

    // Converter tudo para JPG
    const convertedBuffer = await sharp(fileBuffer).jpeg().toBuffer();
    const key = `profile-images/${profileId}.jpg`;

    await this.s3Provider.client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: convertedBuffer,
        ContentType: 'image/jpeg',
      }),
    );

    return {
      url: `https://${this.bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`,
    };
  }

  async deleteProfileImage(profileId: string) {
    const key = `profile-images/${profileId}.jpg`;
    await this.s3Provider.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      }),
    );
    return { message: 'Imagem deletada com sucesso' };
  }
}

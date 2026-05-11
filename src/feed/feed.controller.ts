import { Controller, Get, Post, UseGuards, Req, Query, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { FeedService } from './feed.service';
import { CreatePostDto } from './dto/feed.dto';
import type { FastifyRequest } from 'fastify';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    profile_id: string;
    profile_email: string;
    profile_name: string;
    profile_nickname: string;
  };
}

@Controller('feed')
@UseGuards(AuthGuard)
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Post('posts')
  async createPost(
    @Req() req: AuthenticatedRequest,
    @Query('topic') topic?: string,
    @Query('subgroup') subgroup?: string,
  ) {
    const body = req.body as any;

    // Com attachFieldsToBody: true, campos de texto ficam em body.field.value
    const contentField = body?.content;
    const contentValue: string =
      typeof contentField === 'string'
        ? contentField
        : contentField?.value ?? '';

    if (!contentValue.trim()) {
      throw new BadRequestException('O campo "content" é obrigatório.');
    }

    // Arquivo fica em body.file com ._buf (Buffer) e .mimetype e .filename
    let filePayload: { buffer: Buffer; mimetype: string; originalName: string } | undefined;
    const fileField = body?.file;
    if (fileField && fileField._buf) {
      filePayload = {
        buffer: Buffer.from(fileField._buf),
        mimetype: fileField.mimetype || 'image/jpeg',
        originalName: fileField.filename || `upload_${Date.now()}`,
      };
    }

    const dto: CreatePostDto = { content: contentValue };

    return this.feedService.createPost(req.user, dto, topic, filePayload, subgroup);
  }

  @Get('posts')
  async getPosts(
    @Query('topic') topic?: string,
    @Query('subgroup') subgroup?: string,
    @Query('hashtag') hashtag?: string,
  ) {
    if (hashtag) return this.feedService.searchByHashtag(hashtag);
    if (subgroup) return this.feedService.getPostsBySubgroup(subgroup);
    if (topic && topic.toUpperCase() !== 'FEED') return this.feedService.getPostsByTopic(topic);
    return this.feedService.getGlobalFeed();
  }
}

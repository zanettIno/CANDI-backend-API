import { Controller, Get, Post, Delete, Param, UseGuards, Req, Query, BadRequestException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { FeedService } from './feed.service';
import { ChatGateway } from '../chat/chat.gateway';
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
  constructor(
    private readonly feedService: FeedService,
    private readonly chatGateway: ChatGateway,
  ) {}

  @Post('posts')
  async createPost(
    @Req() req: AuthenticatedRequest,
    @Query('topic') topic?: string,
    @Query('subgroup') subgroup?: string,
  ) {
    const body = req.body as any;

    const contentField = body?.content;
    const contentValue: string =
      typeof contentField === 'string'
        ? contentField
        : contentField?.value ?? '';

    if (!contentValue.trim()) {
      throw new BadRequestException('O campo "content" é obrigatório.');
    }

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
    const result = await this.feedService.createPost(req.user, dto, topic, filePayload, subgroup);
    // Emite new_post via WebSocket para todos os clientes atualizarem o feed
    this.chatGateway.broadcastNewPost({
      post_id: result.post?.post_id,
      topic: result.post?.topic,
      subgroup: result.post?.subgroup,
      profile_name: result.post?.profile_name,
      profile_id: result.post?.profile_id,
    });
    return result;
  }

  @Delete('posts/:postId')
  deletePost(@Req() req: AuthenticatedRequest, @Param('postId') postId: string) {
    return this.feedService.deletePost(req.user.profile_id, postId);
  }

  @Get('posts')
  async getPosts(
    @Query('topic') topic?: string,
    @Query('subgroup') subgroup?: string,
    @Query('hashtag') hashtag?: string,
    @Query('limit') limitStr?: string,
    @Query('lastKey') lastKey?: string,
  ) {
    const limit = limitStr ? Math.min(parseInt(limitStr, 10) || 20, 50) : 20;
    if (hashtag) return this.feedService.searchByHashtag(hashtag, limit, lastKey);
    if (subgroup) return this.feedService.getPostsBySubgroup(subgroup, limit, lastKey);
    if (topic && topic.toUpperCase() !== 'FEED') return this.feedService.getPostsByTopic(topic, limit, lastKey);
    return this.feedService.getGlobalFeed(limit, lastKey);
  }
}

// src/feed/feed.controller.ts
import { Controller, Get, Post, Body, UseGuards, Req, Query, BadRequestException, Delete, Param } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { FeedService } from './feed.service';
import { CreatePostDto, AddCommentDto } from './dto/feed.dto';
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
    @Query('subgroup') subgroup?: string, // 1. RECEBE O SUBGRUPO AQUI
  ) {
    let filePayload: { buffer: Buffer; mimetype: string; originalName: string } | undefined = undefined;
    
    // Pega o objeto do campo 'content'
    const postContentField = (req.body as any)?.content;
    // Pega o valor (texto) de dentro do objeto
    const postContentValue = postContentField?.value; 

    // Valida o texto
    if (!postContentValue || (typeof postContentValue === 'string' && postContentValue.trim().length === 0)) {
      console.error('Falha ao ler o campo "content.value". Body:', req.body);
      throw new BadRequestException('O campo "content" da postagem é obrigatório.');
    }

    // Tenta processar um arquivo (se ele veio junto)
    try {
      const data = await req.file(); 
      if (data && data.filename) { // Garante que é um arquivo real
          const buffer = await data.toBuffer();
          filePayload = {
              buffer,
              mimetype: data.mimetype,
              originalName: data.filename,
          };
      }
    } catch (e) {
       console.log("Info: Postagem sem arquivo anexado.");
    }
    
    // Passa o texto limpo para o DTO
    const dto: CreatePostDto = { content: postContentValue };
  
    // Manda tudo para o Service
    return this.feedService.createPost(
      req.user,
      dto,
      topic,
      filePayload,
      subgroup, // 2. PASSA O SUBGRUPO PARA O SERVICE
    );
  }

  @Get('posts')
  async getPosts(
    @Query('topic') topic?: string,
    @Query('subgroup') subgroup?: string, // 1. RECEBE O SUBGRUPO AQUI
  ) {
    // 2. A LÓGICA DE DECISÃO
    // Se o usuário pediu um subgrupo, ele tem prioridade máxima.
    if (subgroup) {
      console.log(`Buscando Subgrupo: ${subgroup}`);
      return this.feedService.getPostsBySubgroup(subgroup);
    }

    // Se pediu um tópico (e não é o feed global)
    if (topic && topic.toUpperCase() !== 'FEED') {
      console.log(`Buscando Tópico: ${topic}`);
      return this.feedService.getPostsByTopic(topic);
    }

    // Senão, é o feed global
    console.log('Buscando Feed Global...');
    return this.feedService.getGlobalFeed();
  }

  /**
   * Toggle like on a post (add or remove)
   * POST /feed/posts/:postId/likes
   */
  @Post('posts/:postId/likes')
  async toggleLike(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
  ) {
    if (!postId || postId.trim().length === 0) {
      throw new BadRequestException('ID do post é obrigatório');
    }

    const result = await this.feedService.toggleLike(postId, req.user.profile_id);
    return {
      success: true,
      liked: result.liked,
      likes_count: result.count,
    };
  }

  /**
   * Add comment to a post
   * POST /feed/posts/:postId/comments
   */
  @Post('posts/:postId/comments')
  async addComment(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
    @Body() dto: AddCommentDto,
  ) {
    if (!postId || postId.trim().length === 0) {
      throw new BadRequestException('ID do post é obrigatório');
    }

    if (!dto.content || dto.content.trim().length === 0) {
      throw new BadRequestException('Conteúdo do comentário é obrigatório');
    }

    const comment = await this.feedService.addComment(
      postId,
      req.user.profile_id,
      req.user.profile_name || req.user.profile_email,
      dto.content,
    );

    return {
      success: true,
      comment,
    };
  }

  /**
   * Get all comments for a post
   * GET /feed/posts/:postId/comments
   */
  @Get('posts/:postId/comments')
  async getComments(
    @Param('postId') postId: string,
    @Query('limit') limit?: string,
  ) {
    if (!postId || postId.trim().length === 0) {
      throw new BadRequestException('ID do post é obrigatório');
    }

    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 20;
    const comments = await this.feedService.getComments(postId, limitNum);

    return {
      success: true,
      comments,
      count: comments.length,
    };
  }

  /**
   * Delete a comment (only by author)
   * DELETE /feed/comments/:commentId
   */
  @Delete('comments/:commentId')
  async deleteComment(
    @Req() req: AuthenticatedRequest,
    @Param('commentId') commentId: string,
  ) {
    if (!commentId || commentId.trim().length === 0) {
      throw new BadRequestException('ID do comentário é obrigatório');
    }

    await this.feedService.deleteComment(commentId, req.user.profile_id);

    return {
      success: true,
      message: 'Comentário deletado com sucesso',
    };
  }

  /**
   * Check if user liked a post
   * GET /feed/posts/:postId/likes/check
   */
  @Get('posts/:postId/likes/check')
  async checkLike(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
  ) {
    if (!postId || postId.trim().length === 0) {
      throw new BadRequestException('ID do post é obrigatório');
    }

    const userLiked = await this.feedService.checkUserLike(postId, req.user.profile_id);

    return {
      success: true,
      user_liked: userLiked,
    };
  }

  /**
   * Save a post to user's saved posts
   * POST /feed/posts/:postId/save
   */
  @Post('posts/:postId/save')
  async savePost(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
  ) {
    if (!postId || postId.trim().length === 0) {
      throw new BadRequestException('ID do post é obrigatório');
    }

    await this.feedService.savePost(postId, req.user.profile_id);

    return {
      success: true,
      message: 'Post salvo com sucesso',
    };
  }

  /**
   * Unsave a post from user's saved posts
   * DELETE /feed/posts/:postId/save
   */
  @Delete('posts/:postId/save')
  async unsavePost(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
  ) {
    if (!postId || postId.trim().length === 0) {
      throw new BadRequestException('ID do post é obrigatório');
    }

    await this.feedService.unsavePost(postId, req.user.profile_id);

    return {
      success: true,
      message: 'Post removido dos salvos',
    };
  }

  /**
   * Get all saved posts for user
   * GET /feed/saved-posts
   */
  @Get('saved-posts')
  async getSavedPosts(@Req() req: AuthenticatedRequest) {
    const savedPosts = await this.feedService.getSavedPosts(req.user.profile_id);

    return {
      success: true,
      posts: savedPosts,
      count: savedPosts.length,
    };
  }

  /**
   * Check if user saved a post
   * GET /feed/posts/:postId/save/check
   */
  @Get('posts/:postId/save/check')
  async checkSave(
    @Req() req: AuthenticatedRequest,
    @Param('postId') postId: string,
  ) {
    if (!postId || postId.trim().length === 0) {
      throw new BadRequestException('ID do post é obrigatório');
    }

    const isSaved = await this.feedService.checkUserSave(postId, req.user.profile_id);

    return {
      success: true,
      is_saved: isSaved,
    };
  }

  /**
   * Get posts for a specific group
   * GET /feed/groups/:groupId/posts
   */
  @Get('groups/:groupId/posts')
  async getGroupPosts(@Param('groupId') groupId: string) {
    if (!groupId || groupId.trim().length === 0) {
      throw new BadRequestException('ID do grupo é obrigatório');
    }

    const posts = await this.feedService.getGroupPosts(groupId);

    return {
      success: true,
      posts,
      count: posts.length,
    };
  }
}
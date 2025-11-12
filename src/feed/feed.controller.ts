// src/feed/feed.controller.ts
import { Controller, Get, Post, Body, UseGuards, Req, Query, BadRequestException } from '@nestjs/common';
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
}
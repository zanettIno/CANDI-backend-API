// src/diary/diary.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Query,
  Body,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import { DiaryService } from './diary.service';

interface AuthenticatedRequest extends FastifyRequest {
  user: { profile_id: string };
}

@Controller('diary')
export class DiaryController {
  constructor(private readonly diaryService: DiaryService) {}

  @UseGuards(AuthGuard)
  @Post()
  async createDiary(
    @Req() req: AuthenticatedRequest,
    @Body() body: { date: string; content: string },
  ) {
    const userId = req.user.profile_id;
    if (!body.date || !body.content) {
      throw new BadRequestException('Data e conteúdo são obrigatórios');
    }
    return this.diaryService.createDiary(userId, body.date, body.content);
  }

  @UseGuards(AuthGuard)
  @Get()
  async getDiary(@Req() req: AuthenticatedRequest, @Query('date') date: string) {
    const userId = req.user.profile_id;
    if (!date) throw new BadRequestException('A data é obrigatória');
    return this.diaryService.getDiary(userId, date);
  }

  @UseGuards(AuthGuard)
  @Patch()
  async updateDiary(
    @Req() req: AuthenticatedRequest,
    @Body() body: { date: string; content: string },
  ) {
    const userId = req.user.profile_id;
    if (!body.date || !body.content) {
      throw new BadRequestException('Data e conteúdo são obrigatórios');
    }
    return this.diaryService.updateDiary(userId, body.date, body.content);
  }

  @UseGuards(AuthGuard)
  @Delete()
  async deleteDiary(@Req() req: AuthenticatedRequest, @Query('date') date: string) {
    const userId = req.user.profile_id;
    if (!date) throw new BadRequestException('A data é obrigatória');
    return this.diaryService.deleteDiary(userId, date);
  }

  @UseGuards(AuthGuard)
  @Get('list')
  async listDiaries(@Req() req: AuthenticatedRequest) {
    const userId = req.user.profile_id;
    return this.diaryService.listDiaries(userId);
  }
}

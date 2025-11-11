import {
  Controller,
  Post,
  Get,
  Param,
  Req,
  Body,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/auth.guard';
import { CommunityService } from './community.service';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    profile_id: string;
    email?: string;
    [key: string]: any;
  };
}

@Controller('community')
@UseGuards(AuthGuard)
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  @Post('create')
  async createCommunity(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; description: string },
  ) {
    const userId = req.user?.profile_id;
    if (!userId) throw new BadRequestException('Usuário não autenticado');

    return this.communityService.createCommunity(
      userId,
      body.name,
      body.description,
    );
  }

  @Get('user')
  async getUserCommunities(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.profile_id;
    if (!userId) throw new BadRequestException('Usuário não autenticado');

    return this.communityService.getUserCommunities(userId);
  }

  @Post('add-member/:id')
  async addMember(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user?.profile_id;
    if (!userId) throw new BadRequestException('Usuário não autenticado');

    return this.communityService.addMember(id, userId);
  }

  @Post('remove-member/:id')
  async removeMember(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const userId = req.user?.profile_id;
    if (!userId) throw new BadRequestException('Usuário não autenticado');

    return this.communityService.removeMember(id, userId);
  }
}

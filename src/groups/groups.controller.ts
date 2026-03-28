import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  BadRequestException,
  Delete,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/groups.dto';
import type { FastifyRequest } from 'fastify';

interface AuthenticatedRequest extends FastifyRequest {
  user: {
    profile_id: string;
    profile_email: string;
    profile_name: string;
    profile_nickname?: string;
  };
}

@Controller('groups')
@UseGuards(AuthGuard)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * Create a new group
   * POST /groups
   */
  @Post()
  async createGroup(@Req() req: AuthenticatedRequest, @Body() dto: CreateGroupDto) {
    if (!dto.group_name || dto.group_name.trim().length === 0) {
      throw new BadRequestException('Nome do grupo é obrigatório');
    }

    const group = await this.groupsService.createGroup(req.user, dto);

    return {
      success: true,
      group,
      message: 'Grupo criado com sucesso',
    };
  }

  /**
   * Get all public groups
   * GET /groups
   */
  @Get()
  async getGroups() {
    const groups = await this.groupsService.getGroups();

    return {
      success: true,
      groups,
      count: groups.length,
    };
  }

  /**
   * Get user's groups (groups they're member of)
   * GET /groups/my-groups
   */
  @Get('my-groups')
  async getUserGroups(@Req() req: AuthenticatedRequest) {
    const groups = await this.groupsService.getUserGroups(req.user.profile_id);

    return {
      success: true,
      groups,
      count: groups.length,
    };
  }

  /**
   * Get group by ID
   * GET /groups/:groupId
   */
  @Get(':groupId')
  async getGroupById(
    @Req() req: AuthenticatedRequest,
    @Param('groupId') groupId: string,
  ) {
    if (!groupId || groupId.trim().length === 0) {
      throw new BadRequestException('ID do grupo é obrigatório');
    }

    const group = await this.groupsService.getGroupById(groupId);
    const isMember = await this.groupsService.isMember(groupId, req.user.profile_id);

    return {
      success: true,
      group,
      is_member: isMember,
    };
  }

  /**
   * Join a group
   * POST /groups/:groupId/join
   */
  @Post(':groupId/join')
  async joinGroup(@Req() req: AuthenticatedRequest, @Param('groupId') groupId: string) {
    if (!groupId || groupId.trim().length === 0) {
      throw new BadRequestException('ID do grupo é obrigatório');
    }

    await this.groupsService.joinGroup(groupId, req.user.profile_id);

    return {
      success: true,
      message: 'Você entrou no grupo com sucesso',
    };
  }

  /**
   * Leave a group
   * DELETE /groups/:groupId/leave
   */
  @Delete(':groupId/leave')
  async leaveGroup(@Req() req: AuthenticatedRequest, @Param('groupId') groupId: string) {
    if (!groupId || groupId.trim().length === 0) {
      throw new BadRequestException('ID do grupo é obrigatório');
    }

    await this.groupsService.leaveGroup(groupId, req.user.profile_id);

    return {
      success: true,
      message: 'Você saiu do grupo',
    };
  }

  /**
   * Check if user is member of group
   * GET /groups/:groupId/is-member
   */
  @Get(':groupId/is-member')
  async checkMembership(
    @Req() req: AuthenticatedRequest,
    @Param('groupId') groupId: string,
  ) {
    if (!groupId || groupId.trim().length === 0) {
      throw new BadRequestException('ID do grupo é obrigatório');
    }

    const isMember = await this.groupsService.isMember(groupId, req.user.profile_id);

    return {
      success: true,
      is_member: isMember,
    };
  }
}

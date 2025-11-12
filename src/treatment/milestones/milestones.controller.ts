import { Controller, Post, Get, Body, UseGuards, Req, Param } from '@nestjs/common';
import { MilestonesService } from './milestones.service';
import { AuthGuard } from '../../auth/auth.guard';

interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
  };
}

@Controller('milestones')
@UseGuards(AuthGuard)
export class MilestonesController {
  constructor(private readonly service: MilestonesService) {}

  @Post()
  async createMilestone(
    @Req() req: AuthenticatedRequest,
    @Body() body: {
      title: string;
      description?: string;
      date?: string;
      type?: 'fixed' | 'custom';
      position?: number | null;
      profile_id?: string; // ← Adicione como fallback
    },
  ) {
    // Use profile_id do token JWT ou do body como fallback
    const profileId = req.user?.profile_id || body.profile_id;

    if (!profileId) {
      throw new Error('Profile ID não encontrado');
    }

    console.log('Profile ID usado:', profileId); // Debug
    console.log('Req.user:', req.user); // Debug
    console.log('Body:', body); // Debug

    return this.service.createMilestone(profileId, {
      title: body.title,
      description: body.description,
      date: body.date,
      type: body.type,
      position: body.position,
    });
  }

  @Get()
  async listMilestones(@Req() req: AuthenticatedRequest) {
    const profileId = req.user?.profile_id;
    
    if (!profileId) {
      throw new Error('Profile ID não encontrado no token');
    }

    return this.service.listMilestones(profileId);
  }

  @Get(':profile_id')
  async listMilestonesByProfileId(@Param('profile_id') profile_id: string) {
    return this.service.listMilestones(profile_id);
  }
}
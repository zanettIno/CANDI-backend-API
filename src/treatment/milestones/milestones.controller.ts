import { Controller, Post, Param, Body, Get } from '@nestjs/common';
import { MilestonesService } from './milestones.service';

@Controller('patients/:id/treatment/milestones')
export class MilestonesController {
  constructor(private readonly service: MilestonesService) {}

  @Post()
  async createMilestone(
    @Param('id') profileId: string,
    @Body() body: {
      title: string;
      description?: string;
      date?: string;
      type?: 'fixed' | 'custom';
      position?: number | null;
    },
  ) {
    return this.service.createMilestone(profileId, body);
  }

  @Get()
  async listMilestones(@Param('id') profileId: string) {
    return this.service.listMilestones(profileId);
  }
}

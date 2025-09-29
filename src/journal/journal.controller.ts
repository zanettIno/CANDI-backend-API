import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { JournalService } from './journal.service';

@Controller('patients/:id/journal')
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Post('feelings')
  async addFeeling(
    @Param('id') profileId: string,
    @Body() body: { happiness: number; observation: string },
  ) {
    return this.service.addFeeling(profileId, body);
  }

  @Get('feelings')
  async getFeelings(@Param('id') profileId: string) {
    return this.service.getFeelings(profileId);
  }
}

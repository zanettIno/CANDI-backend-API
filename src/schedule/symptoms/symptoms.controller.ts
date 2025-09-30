import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { SymptomsService } from './symptoms.service';

@Controller('schedule/symptoms')
export class SymptomsController {
  constructor(private readonly symptomsService: SymptomsService) {}

  @Post()
  create(@Body() body: { profile_id: string; description: string }) {
    return this.symptomsService.addSymptom(body);
  }

  @Get(':profile_id')
  findAll(@Param('profile_id') profile_id: string) {
    return this.symptomsService.listSymptomsByProfile(profile_id);
  }
}

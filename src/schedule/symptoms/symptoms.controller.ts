import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { SymptomsService } from './symptoms.service';

@Controller('schedule/symptoms')
export class SymptomsController {
  constructor(private readonly symptomsService: SymptomsService) {}

  @Post()
  create(@Body() body: { email: string; description: string }) {
    return this.symptomsService.addSymptom(body);
  }

  @Get(':email')
  findAll(@Param('email') email: string) {
    return this.symptomsService.listSymptomsByEmail(email);
  }
}
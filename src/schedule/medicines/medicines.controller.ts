import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { MedicinesService } from './medicines.service';

@Controller('schedule/medicines')
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Post()
  create(@Body() body: {
    email: string;
    medicine_name: string;
    medicine_dosage: string;
    medicine_period: string;
    medicine_posology: string;
    medicine_obs?: string;
  }) {
    return this.medicinesService.create(body);
  }

  // Rota corrigida para não conflitar com a rota de :id
  @Get('by-email/:email') 
  findAllByEmail(@Param('email') email: string) {
    return this.medicinesService.findAllByEmail(email);
  }

  // As rotas abaixo são placeholders gerados pela CLI.
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.medicinesService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() payload: any) {
    return this.medicinesService.update(+id, payload);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.medicinesService.remove(+id);
  }
}
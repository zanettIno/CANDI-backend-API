import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { JournalService } from './journal.service';

@Controller('journal') // 1. Simplificamos a rota base
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Post('feelings')
  // 2. O corpo agora contém o e-mail junto com os dados do sentimento
  async addFeeling(
    @Body() body: { email: string; happiness: number; observation: string },
  ) {
    return this.service.addFeeling(body);
  }

  @Get('feelings/:email') // 3. A rota agora espera o e-mail como parâmetro
  async getFeelings(@Param('email') email: string) {
    return this.service.getFeelingsByEmail(email);
  }
}
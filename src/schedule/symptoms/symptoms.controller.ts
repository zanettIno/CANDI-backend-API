import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { SymptomsService } from './symptoms.service';
import { AuthGuard } from '../../auth/auth.guard'; // 1. Importe o AuthGuard

// Interface para o pedido autenticado
interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
  };
}

@Controller('schedule/symptoms')
@UseGuards(AuthGuard) // 2. Aplique o Guard a todas as rotas do controller
export class SymptomsController {
  constructor(private readonly symptomsService: SymptomsService) {}

  @Post()
  // 3. O body agora só precisa da descrição, o usuário vem do token
  create(@Req() req: AuthenticatedRequest, @Body() body: { description: string }) {
    return this.symptomsService.addSymptom(req.user, body.description);
  }

  @Get() // 4. A rota GET agora é mais simples e não precisa de parâmetro
  findAll(@Req() req: AuthenticatedRequest) {
    // Busca os sintomas usando o usuário que vem do token
    return this.symptomsService.listSymptomsByUser(req.user);
  }
}
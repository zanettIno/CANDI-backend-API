import { Controller, Get, Post, Body, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { MedicinesService } from './medicines.service';
import { AuthGuard } from '../../auth/auth.guard'; // 1. Importe o AuthGuard

// Interface para o pedido autenticado
interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
  };
}

@Controller('schedule/medicines')
@UseGuards(AuthGuard) // 2. APLIQUE O GUARD A TODAS AS ROTAS DO CONTROLLER
export class MedicinesController {
  constructor(private readonly medicinesService: MedicinesService) {}

  @Post()
  // 3. O 'email' já não é preciso no body, pois vem do token
  create(@Req() req: AuthenticatedRequest, @Body() body: {
    medicine_name: string;
    medicine_dosage: string;
    medicine_period: string;
    medicine_posology: string;
    medicine_obs?: string;
  }) {
    // Passamos o objeto 'user' (que o AuthGuard nos deu) e o 'body' para o serviço
    return this.medicinesService.create(req.user, body);
  }

  @Get() // 4. A rota agora é mais simples, não precisa do e-mail
  findAll(@Req() req: AuthenticatedRequest) {
    // Usamos o e-mail do usuário autenticado para fazer a busca
    return this.medicinesService.findAllByEmail(req.user.profile_email);
  }
}
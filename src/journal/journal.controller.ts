import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { JournalService } from './journal.service';
import { AuthGuard } from '../auth/auth.guard'; // 1. Importe o AuthGuard

// Interface para o pedido autenticado
interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
  };
}

@Controller('journal')
@UseGuards(AuthGuard) // 2. Aplique o Guard a todas as rotas do controller
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Post('feelings')
  // 3. O body agora não precisa mais do e-mail
  async addFeeling(
    @Req() req: AuthenticatedRequest,
    @Body() body: { happiness: number; observation: string },
  ) {
    // Passamos o 'user' que o AuthGuard nos deu para o serviço
    return this.service.addFeeling(req.user, body);
  }

  @Get('feelings') // 4. A rota GET agora é mais simples
  async getFeelings(@Req() req: AuthenticatedRequest) {
    // Usamos o 'user' do token para buscar os sentimentos
    return this.service.getFeelingsByUser(req.user);
  }
}
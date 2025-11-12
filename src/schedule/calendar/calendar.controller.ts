import { Controller, Post, Get, Param, Body, UseGuards, Req } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { AuthGuard } from '../../auth/auth.guard'; // 1. Importe o AuthGuard

// Interface para o pedido autenticado
interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
  };
}

// Interface para o corpo do evento
interface EventBody {
  appointment_name: string;
  appointment_date: string;
  appointment_time: string;
  local?: string;
  observation?: string;
}

@Controller('calendar') // 2. Rota base simplificada
@UseGuards(AuthGuard) // 3. Aplique o Guard
export class CalendarController {
  constructor(private readonly service: CalendarService) {}

  @Post('events')
  createEvent(
    @Req() req: AuthenticatedRequest, // 4. Obtenha o usuário do token
    @Body() body: EventBody,
  ) {
    return this.service.createEvent(req.user, body);
  }

  @Get('events')
  listEvents(@Req() req: AuthenticatedRequest) { // 5. Obtenha o usuário do token
    return this.service.listEvents(req.user);
  }

  @Get('summary')
  getSummary(@Req() req: AuthenticatedRequest) { // 6. Obtenha o usuário do token
    return this.service.getMonthlySummary(req.user);
  }
}
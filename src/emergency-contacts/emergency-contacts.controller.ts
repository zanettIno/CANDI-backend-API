import { Controller, Patch, Body, UseGuards, Req } from '@nestjs/common';
import { EmergencyContactsService } from './emergency-contacts.service';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';
import { AuthGuard } from '../auth/auth.guard'; // 1. Importe o AuthGuard

// Interface para o pedido autenticado
interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
  };
}

@Controller('emergency-contact') // 2. Rota base simplificada
@UseGuards(AuthGuard) // 3. Aplique o Guard a todas as rotas
export class EmergencyContactsController {
  constructor(
    private readonly emergencyContactsService: EmergencyContactsService,
  ) {}

  @Patch() // 4. A rota já não precisa de parâmetros
  update(
    @Req() req: AuthenticatedRequest, // Obtém o usuário do token
    @Body() contactDto: UpdateEmergencyContactsDto,
  ) {
    // Passa o objeto 'user' para o serviço
    return this.emergencyContactsService.update(req.user, contactDto);
  }
}
import { Controller, Post, Get, Body, UseGuards, Req } from '@nestjs/common';
import { EmergencyContactsService } from './emergency-contacts.service';
import { AuthGuard } from '../auth/auth.guard';

// Interface para o pedido autenticado
interface AuthenticatedRequest {
  user: {
    profile_id: string;
    profile_email: string;
  };
}

// Interface para o corpo da requisição
interface CreateContactBody {
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

@Controller('emergency-contact')
@UseGuards(AuthGuard)
export class EmergencyContactsController {
  constructor(
    private readonly emergencyContactsService: EmergencyContactsService,
  ) {}

  @Post() // ALTERADO: De PATCH para POST
  create(
    @Req() req: AuthenticatedRequest,
    @Body() contactDto: CreateContactBody,
  ) {
    // Chama o novo método 'createContact'
    return this.emergencyContactsService.createContact(req.user, contactDto);
  }

  @Get() // NOVO: Rota para listar os contatos
  findAll(@Req() req: AuthenticatedRequest) {
    return this.emergencyContactsService.listContacts(req.user);
  }
}
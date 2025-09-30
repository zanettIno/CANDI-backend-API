import { Controller, Patch, Body, Param } from '@nestjs/common';
import { EmergencyContactsService } from './emergency-contacts.service';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';

@Controller('users') // O endpoint será /users
export class EmergencyContactsController {
  constructor(
    private readonly emergencyContactsService: EmergencyContactsService,
  ) {}

  @Patch(':id/emergency-contact') // Ex: PATCH /users/1234-abc/emergency-contact
  update(
    @Param('id') userId: string,
    @Body() contactDto: UpdateEmergencyContactsDto,
  ) {
    return this.emergencyContactsService.update(userId, contactDto);
  }
}
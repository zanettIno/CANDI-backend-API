import { Controller, Patch, Body, Param } from '@nestjs/common';
import { EmergencyContactsService } from './emergency-contacts.service';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';

@Controller('users') 
export class EmergencyContactsController {
  constructor(
    private readonly emergencyContactsService: EmergencyContactsService,
  ) {}

  @Patch(':id/emergency-contact') 
  update(
    @Param('id') userId: string,
    @Body() contactDto: UpdateEmergencyContactsDto,
  ) {
    return this.emergencyContactsService.update(userId, contactDto);
  }
}
import { IsNotEmpty, IsString, IsOptional, IsPhoneNumber } from 'class-validator';

export class UpdateEmergencyContactsDto {
  @IsString()
  @IsNotEmpty()
  emergency_contact_name: string;

  // A validação IsPhoneNumber pode ser usada se você instalar a biblioteca `class-validator`
  // Por agora, vamos usar IsString
  @IsString()
  @IsNotEmpty()
  emergency_contact_phone: string;

  @IsString()
  @IsNotEmpty()
  emergency_contact_relationship: string; // "rela" virou "relationship" para clareza
}
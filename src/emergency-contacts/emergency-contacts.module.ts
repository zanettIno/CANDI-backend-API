import { Module } from '@nestjs/common';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsService } from './emergency-contacts.service';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [AuthModule, DynamoDBModule], // Importa os módulos necessários
  controllers: [EmergencyContactsController],
  providers: [EmergencyContactsService], // Removemos o provider duplicado
})
export class EmergencyContactsModule {}
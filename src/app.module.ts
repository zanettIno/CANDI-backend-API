import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DynamoDBModule } from './dynamodb/dynamodb.module';
import { AuthModule } from './auth/auth.module';
import { SymptomsModule } from './schedule/symptoms/symptoms.module';
import { EmergencyContactsModule } from './emergency-contacts/emergency-contacts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDBModule,
    AuthModule,
    SymptomsModule,
    EmergencyContactsModule,
  ],
})
export class AppModule {}

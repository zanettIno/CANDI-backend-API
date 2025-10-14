import { Module } from '@nestjs/common';
import { SymptomsController } from './symptoms.controller';
import { SymptomsService } from './symptoms.service';
import { AuthModule } from '../../auth/auth.module';
import { DynamoDBModule } from '../../dynamodb/dynamodb.module';

@Module({
  imports: [AuthModule, DynamoDBModule], // Garante acesso ao AuthGuard e ao DYNAMO_CLIENT
  controllers: [SymptomsController],
  providers: [SymptomsService], // Removemos o provider duplicado
})
export class SymptomsModule {}
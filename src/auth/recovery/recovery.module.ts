import { Module } from '@nestjs/common';
import { PasswordRecoveryService } from './password-recovery.service';
import { RecuperarController } from './recovery.controller';
import { DynamoDBModule } from 'src/dynamodb/dynamodb.module';

@Module({
   imports: [
      DynamoDBModule
    ],
  providers: [PasswordRecoveryService],
  controllers: [RecuperarController],
})
export class RecuperarModule {}

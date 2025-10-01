import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { AuthModule } from '../auth/auth.module'; // <-- Adicione esta linha

@Module({
  imports: [DynamoDBModule, AuthModule], // <-- Adicione AuthModule aqui
  providers: [JournalService],
  controllers: [JournalController],
})
export class JournalModule {}
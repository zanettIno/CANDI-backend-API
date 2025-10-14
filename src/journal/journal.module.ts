import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [DynamoDBModule, AuthModule],
  providers: [JournalService],
  controllers: [JournalController],
})
export class JournalModule {}
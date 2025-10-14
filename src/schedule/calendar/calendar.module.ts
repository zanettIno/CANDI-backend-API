import { Module } from '@nestjs/common';
import { CalendarService } from './calendar.service';
import { CalendarController } from './calendar.controller';
import { DynamoDBModule } from '../../dynamodb/dynamodb.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [DynamoDBModule, AuthModule],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}

import { Module } from '@nestjs/common';
import { MilestonesService } from './milestones.service';
import { MilestonesController } from './milestones.controller';
import { DynamoDBModule } from '../../dynamodb/dynamodb.module';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [DynamoDBModule, AuthModule],
  controllers: [MilestonesController],
  providers: [MilestonesService],
})
export class MilestonesModule {}

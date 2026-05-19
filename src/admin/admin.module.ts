import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { SupportController } from './support.controller';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { DiaryModule } from '../diary/diary.module';

@Module({
  imports: [AuthModule, DynamoDBModule, DiaryModule],
  controllers: [AdminController, SupportController],
  providers: [AdminService, AdminGuard],
  exports: [AdminGuard],
})
export class AdminModule {}

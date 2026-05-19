import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [AuthModule, DynamoDBModule],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
  exports: [AdminGuard],
})
export class AdminModule {}

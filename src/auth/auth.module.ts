import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';

@Module({
  imports: [DynamoDBModule],
  providers: [AuthService],
  controllers: [AuthController],
})
export class AuthModule {}

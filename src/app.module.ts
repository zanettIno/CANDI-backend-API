import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DynamoDBModule } from './dynamodb/dynamodb.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDBModule,
    AuthModule,
  ],
})
export class AppModule {}

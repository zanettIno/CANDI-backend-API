import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    DynamoDBModule,
    JwtModule.register({
      secret: process.env.ACCESS_TOKEN_SECRET || 'default_secret',
      signOptions: { expiresIn: '12h' },
    }),
  ],
  providers: [AuthService, AuthGuard],
  controllers: [AuthController],
  exports: [
    AuthService,
    AuthGuard,
    JwtModule, // 🔹 exportando JwtModule para outros módulos
  ],
})
export class AuthModule {}

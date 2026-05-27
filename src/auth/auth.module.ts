import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { DynamoDBModule } from '../dynamodb/dynamodb.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    DynamoDBModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('ACCESS_TOKEN_SECRET') || 'default_secret',
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  providers: [AuthService, AuthGuard],
  controllers: [AuthController],
  exports: [
    AuthService,
    AuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}

import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('register')
  async register(
    @Body()
    body: {
      profile_name: string;
      profile_nickname: string;
      profile_email: string;
      profile_password: string;
      profile_birth_date: string;
      cancer_type_id: number;
    },
  ) {
    return this.service.register(body);
  }
}

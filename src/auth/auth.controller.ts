import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('register')
  async register(
    @Body()
    body: {
      name: string;
      nickname: string;
      email: string;
      password: string;
      birth_date: string;
      cancer_type_id: number;
    },
  ) {
    return this.service.register(body);
  }
}

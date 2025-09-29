import { Controller, Post, Body, Res, Get } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto, RefreshDto, TokenVerifyDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')

  async register(@Body() body) {
    return this.authService.register(body);
  }

  @Post('login')
  async login(@Body() body: AuthDto, @Res({ passthrough: true }) res) {
    return this.authService.login(body, res);
  }

  @Get('logout')
  async logout(@Res({ passthrough: true }) res) {
    return this.authService.logout(res);
  }

  @Post('refresh')
  async refresh(@Body() body: RefreshDto, @Res({ passthrough: true }) res) {
    return this.authService.refreshTokens(body.refreshToken, res);
  }

  @Post('verify-token')
  async verifyToken(@Body() body: TokenVerifyDto, @Res({ passthrough: true }) res) {
    return this.authService.verifyToken(body.accessToken, body.refreshToken, res);
}}

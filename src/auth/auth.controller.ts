import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto, RefreshDto, TokenVerifyDto } from './auth.dto';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() body) {
    return this.authService.register(body);
  }

  @Post('google')
async googleLogin(@Body() body, @Res({ passthrough: true }) res) {
  return this.authService.googleLogin(body, res);
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

  @UseGuards(AuthGuard)
  @Get('me')
  getProfile(@Req() req) {
    return req.user;
  }
}

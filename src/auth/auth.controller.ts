import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto, RefreshDto, TokenVerifyDto } from './auth.dto';
import { AuthGuard } from './auth.guard';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')

  async register(@Body() body) {
    return this.authService.register(body);
  }

  @Post('login')
  async login(@Body() body: AuthDto) {
    return this.authService.login(body);
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
}
  @UseGuards(AuthGuard)
  @Get('me')
  getProfile(@Req() req) {
    return this.authService.getProfile(req.user.id);
  }
}

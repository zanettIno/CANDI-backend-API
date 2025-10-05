import { Body, Controller, Post } from '@nestjs/common';
import { PasswordRecoveryService } from './password-recovery.service';

@Controller('recuperar')
export class RecuperarController {
  constructor(private readonly recoveryService: PasswordRecoveryService) {}

  @Post('send-code')
  sendCode(@Body('email') email: string) {
    return this.recoveryService.sendRecoveryCode(email);
  }

  @Post('verify-code')
  verifyCode(@Body() body: { email: string, code: string }) {
    return this.recoveryService.verifyCode(body.email, body.code);
  }

  @Post('reset-password')
  resetPassword(@Body() body: { email: string, code: string, newPassword: string }) {
    return this.recoveryService.resetPassword(body.email, body.code, body.newPassword);
  }
}

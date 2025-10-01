// src/auth/auth.guard.ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Token não encontrado ou mal formatado');
    }
    const token = authHeader.split(' ')[1];

    try {
        const payload = await this.jwtService.verifyAsync(token);
        request['user'] = payload;
    } catch {
        throw new UnauthorizedException('Token inválido');
    }
    return true;
    }
}
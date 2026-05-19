import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Inject } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('DYNAMO_CLIENT') private readonly db: DynamoDBDocumentClient,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const auth = req.headers?.authorization || req.headers?.Authorization;
    if (!auth?.startsWith('Bearer ')) throw new ForbiddenException('Acesso restrito');

    const token = auth.replace('Bearer ', '');
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new ForbiddenException('Token inválido');
    }

    const profile = await this.db.send(new GetCommand({
      TableName: process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile',
      Key: { profile_id: payload.id },
    }));

    if (profile.Item?.role !== 'admin') throw new ForbiddenException('Acesso restrito a administradores');

    req.user = {
      profile_id: payload.id,
      profile_email: payload.email,
      profile_name: payload.name,
      profile_nickname: payload.nickname || payload.name,
      role: 'admin',
    };
    return true;
  }
}

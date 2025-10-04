import { CanActivate, ExecutionContext, Injectable, UnauthorizedException, Inject } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @Inject('DYNAMO_CLIENT') private readonly db: DynamoDBDocumentClient,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token não encontrado ou mal formatado');
    }

    const token = authHeader.split(' ')[1];

    try {
      // Verifica JWT
      const payload: any = await this.jwtService.verifyAsync(token, {
        secret: process.env.ACCESS_TOKEN_SECRET,
      });

      // Busca usuário completo no DynamoDB
      const result = await this.db.send(
        new GetCommand({
          TableName: process.env.DYNAMO_TABLE_PROFILE,
          Key: { profile_id: payload.id },
        }),
      );

      if (!result.Item) {
        throw new UnauthorizedException('Usuário não encontrado');
      }

      const { profile_password, ...user } = result.Item;
      request['user'] = user;

      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado');
    }
  }
}

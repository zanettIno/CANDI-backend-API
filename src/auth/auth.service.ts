import { Injectable, BadRequestException, UnauthorizedException, Inject, NotFoundException } from '@nestjs/common';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from './auth.dto';

@Injectable()
export class AuthService {
  private tableName = process.env.DYNAMO_TABLE || 'CANDIProfile';

  constructor(
    private jwtService: JwtService,
    @Inject('DYNAMO_CLIENT') private readonly db: DynamoDBDocumentClient,
  ) {}

  // ==================== REGISTER ====================
  async register(user: {
  name: string;
  nickname: string;
  email: string;
  password: string;
  birth_date: string;
  cancer_type_id: number;
}) {
 
  const existing = await this.db.send(
    new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'profile_email = :email',
      ExpressionAttributeValues: { ':email': user.email },
    }),
  );

  if (existing.Items && existing.Items.length > 0) {
    throw new BadRequestException('E-mail já cadastrado');
  }

  const hashedPassword = await bcrypt.hash(user.password, 10);

  const newUser = {
    profile_id: randomUUID(),
    profile_name: user.name,
    profile_nickname: user.nickname,
    profile_email: user.email,
    profile_password: hashedPassword,
    profile_birth_date: user.birth_date,
    cancer_type_id: user.cancer_type_id,
  };

  await this.db.send(
    new PutCommand({
      TableName: this.tableName,
      Item: newUser,
    }),
  );

  const { profile_password, ...result } = newUser;

  return { message: 'Usuário registrado com sucesso', user: result };
}
  // ==================== LOGIN ====================
  async login(data: AuthDto) {
    console.log('--- ROTA DE LOGIN ATINGIDA! DADOS RECEBIDOS:', data.email, '---');

    const result = await this.db.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'profile_email = :email',
        ExpressionAttributeValues: { ':email': data.email },
      }),
    );

    const user = result.Items?.[0];
    if (!user) throw new BadRequestException('Usuário não encontrado');


    const passwordMatch = await bcrypt.compare(data.password, user.profile_password);
    if (!passwordMatch) throw new UnauthorizedException('Senha incorreta');

    const accessToken = await this.jwtService.signAsync(
    { id: user.profile_id, email: user.profile_email },
    { expiresIn: '30m' },
  );
  
  //const refreshToken = await this.jwtService.signAsync({ id: user.profile_id, email: user.profile_email });

  //const isProduction = process.env.NODE_ENV === 'production';

  //res.cookie('ACCESS_TOKEN', accessToken, {
    //httpOnly: true,
    //secure: isProduction,
    // NOVO: Usa 'lax' em desenvolvimento para evitar problemas com http
    //sameSite: isProduction ? 'none' : 'lax',
    //maxAge: 30 * 60 * 1000,
  //});

  //res.cookie('REFRESH_TOKEN', refreshToken, {
    //httpOnly: true,
    //secure: isProduction,
    // NOVO: Usa 'lax' em desenvolvimento para evitar problemas com http
    //sameSite: isProduction ? 'none' : 'lax',
  //});

  return { message: 'Login bem-sucedido!', accessToken: accessToken, };
  }
// ==================== Consulta Email ====================
// criei essa bomba para o modulo de sintomas puxar o email do usuario e atrelar o sintoma ao usuario pelo seu email usando emailIndex
    async findProfileByEmail(email: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'profile_email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );

    const user = result.Items?.[0];
    if (!user) {
      throw new BadRequestException('Usuário com este e-mail não foi encontrado');
    }
    return user;
  }


  async getProfile(userId: string) {
  const result = await this.db.send(
    new GetCommand({ TableName: this.tableName, Key: { profile_id: userId } }),
  );
  if (!result.Item) throw new NotFoundException('Usuário não encontrado');
  
  const { profile_password, ...userProfile } = result.Item;
  return userProfile;
}

  // ==================== LOGOUT ====================
  async logout(res: any) {
    if (!res || !res.clearCookie) {
      throw new Error('Response object inválido. Certifique-se de usar @Res({ passthrough: true })');
    }

    res.clearCookie('ACCESS_TOKEN');
    res.clearCookie('REFRESH_TOKEN');
    return { message: 'Logout efetuado com sucesso' };
  }

  // ==================== REFRESH TOKENS ====================
  async refreshTokens(refreshToken: string, res) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken);
      const result = await this.db.send(
        new GetCommand({ TableName: this.tableName, Key: { profile_id: payload.id } }),
      );
      const user = result.Item;
      if (!user) throw new BadRequestException('Usuário não encontrado');

      const newAccessToken = await this.jwtService.signAsync(
        { id: user.profile_id, email: user.profile_email },
        { expiresIn: '30m' },
      );

      res.cookie('ACCESS_TOKEN', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'none',
        maxAge: 30 * 60 * 1000,
      });

      return { message: 'Token regenerado!', accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException('Refresh token inválido');
    }
  }

  // ==================== VERIFY TOKEN ====================
  async verifyToken(accessToken: string, refreshToken: string, res) {
    try {
      const payload = await this.jwtService.verifyAsync(accessToken);
      return { user: payload, accessToken };
    } catch {
      return await this.refreshTokens(refreshToken, res);
    }
  }
}

import { Injectable, BadRequestException, UnauthorizedException, NotFoundException, Inject } from '@nestjs/common';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { JwtService } from '@nestjs/jwt';
import { AuthDto } from './auth.dto';

@Injectable()
export class AuthService {
  private tableName = process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile';

  constructor(
    private readonly jwtService: JwtService,
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

    if (existing.Items?.length) {
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
      new PutCommand({ TableName: this.tableName, Item: newUser }),
    );

    const { profile_password, ...result } = newUser;
    return { message: 'Usuário registrado com sucesso', user: result };
  }

  // ==================== LOGIN ====================
  async login(data: AuthDto, res: any) {
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
      { secret: process.env.ACCESS_TOKEN_SECRET, expiresIn: '30m' },
    );

    const refreshToken = await this.jwtService.signAsync(
      { id: user.profile_id, email: user.profile_email },
      { secret: process.env.REFRESH_TOKEN_SECRET, expiresIn: '7d' },
    );

    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('ACCESS_TOKEN', accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 30 * 60 * 1000,
    });

    res.cookie('REFRESH_TOKEN', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });

    return { message: 'Login bem-sucedido!', accessToken, refreshToken};
  }

  // ==================== LOGOUT ====================
  async logout(res: any) {
    res.clearCookie('ACCESS_TOKEN');
    res.clearCookie('REFRESH_TOKEN');
    return { message: 'Logout efetuado com sucesso' };
  }

  // ==================== REFRESH TOKEN ====================
async refreshTokens(refreshToken: string, res) {
  const payload = this.jwtService.verify(refreshToken);

  const newAccessToken = this.jwtService.sign({ sub: payload.sub }, { expiresIn: '30m' });
  const newRefreshToken = this.jwtService.sign({ sub: payload.sub }, { expiresIn: '7d' });

  res.cookie('ACCESS_TOKEN', newAccessToken, { httpOnly: true });
  res.cookie('REFRESH_TOKEN', newRefreshToken, { httpOnly: true });

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
}

  // ==================== GET USER PROFILE ====================
  async getProfile(userId: string) {
    const result = await this.db.send(
      new GetCommand({ TableName: this.tableName, Key: { profile_id: userId } }),
    );
    if (!result.Item) throw new NotFoundException('Usuário não encontrado');

    const { profile_password, ...userProfile } = result.Item;
    return userProfile;
  }

  // ==================== FIND PROFILE BY EMAIL ====================
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
    if (!user) throw new BadRequestException('Usuário com este e-mail não foi encontrado');
    return user;
  }

  async googleLogin(data: { email: string; name: string; picture?: string }, res: any) {
  const { email, name, picture } = data;

  // Verifica se usuário já existe
  const existing = await this.db.send(
    new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'profile_email = :email',
      ExpressionAttributeValues: { ':email': email },
    }),
  );

  let user = existing.Items?.[0];

  // Se não existir, cria
  if (!user) {
    user = {
      profile_id: randomUUID(),
      profile_name: name,
      profile_nickname: name,
      profile_email: email,
      profile_picture: picture,
      profile_password: null, // Google login não usa senha
    };

    await this.db.send(new PutCommand({
      TableName: this.tableName,
      Item: user,
    }));
  }

  // Cria tokens igual ao login normal
  const accessToken = await this.jwtService.signAsync(
    { id: user.profile_id, email: user.profile_email },
    { secret: process.env.ACCESS_TOKEN_SECRET, expiresIn: '30m' },
  );

  const refreshToken = await this.jwtService.signAsync(
    { id: user.profile_id, email: user.profile_email },
    { secret: process.env.REFRESH_TOKEN_SECRET, expiresIn: '7d' },
  );

  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie('ACCESS_TOKEN', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 60 * 1000,
  });

  res.cookie('REFRESH_TOKEN', refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });

  return {
    message: 'Login Google bem-sucedido!',
    accessToken,
    refreshToken,
    user: {
      email: user.profile_email,
      name: user.profile_name,
      picture: user.profile_picture,
    },
  };
}

}

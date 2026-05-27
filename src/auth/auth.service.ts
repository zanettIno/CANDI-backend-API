import { Injectable, BadRequestException, UnauthorizedException, NotFoundException, ForbiddenException, Inject } from '@nestjs/common';
import { DynamoDBDocumentClient, GetCommand, PutCommand, ScanCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import * as nodemailer from 'nodemailer';
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
    adminSecret?: string;
  }) {
    const email = user.email.toLowerCase().trim();
    const existing = await this.db.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'profile_email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );

    if (existing.Items?.length) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    const hashedPassword = await bcrypt.hash(user.password, 10);
    // Permite criar admin se o adminSecret estiver correto
    const isAdmin = user.adminSecret && user.adminSecret === process.env.ADMIN_SECRET;
    const newUser = {
      profile_id: randomUUID(),
      profile_name: user.name,
      profile_nickname: user.nickname,
      profile_email: email,
      profile_password: hashedPassword,
      profile_birth_date: user.birth_date,
      cancer_type_id: user.cancer_type_id,
      role: isAdmin ? 'admin' : 'patient',
      profile_status: 'active',
    };

    await this.db.send(
      new PutCommand({ TableName: this.tableName, Item: newUser }),
    );

    const { profile_password, ...result } = newUser;
    return { message: 'Usuário registrado com sucesso', user: result };
  }

  // ==================== LOGIN ====================
  async login(data: AuthDto, res: any) {
    const email = data.email.toLowerCase().trim();
    const result = await this.db.send(
      new ScanCommand({
        TableName: this.tableName,
        FilterExpression: 'profile_email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );

    const user = result.Items?.[0];
    if (!user) throw new BadRequestException('Usuário não encontrado');

    const passwordMatch = await bcrypt.compare(data.password, user.profile_password);
    if (!passwordMatch) throw new UnauthorizedException('Senha incorreta');

    const accessToken = await this.jwtService.signAsync(
      { id: user.profile_id, email: user.profile_email },
      { secret: process.env.ACCESS_TOKEN_SECRET, expiresIn: '12h' },
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
      maxAge: 12 * 60 * 60 * 1000,
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
    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: process.env.REFRESH_TOKEN_SECRET });
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const isProduction = process.env.NODE_ENV === 'production';

    const newAccessToken = await this.jwtService.signAsync(
      { id: payload.id, email: payload.email },
      { secret: process.env.ACCESS_TOKEN_SECRET, expiresIn: '12h' },
    );
    const newRefreshToken = await this.jwtService.signAsync(
      { id: payload.id, email: payload.email },
      { secret: process.env.REFRESH_TOKEN_SECRET, expiresIn: '7d' },
    );

    res.cookie('ACCESS_TOKEN', newAccessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      maxAge: 12 * 60 * 60 * 1000,
    });
    res.cookie('REFRESH_TOKEN', newRefreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
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

  // ==================== UPDATE USER PROFILE ====================
  async updateProfile(userId: string, dto: {
    profile_name?: string;
    profile_nickname?: string;
    profile_birth_date?: string;
    cancer_type_id?: number;
  }) {
    const { UpdateCommand } = await import('@aws-sdk/lib-dynamodb');
    const fields: string[] = [];
    const values: Record<string, any> = {};
    const names: Record<string, string> = {};

    if (dto.profile_name?.trim()) { fields.push('#n = :n'); names['#n'] = 'profile_name'; values[':n'] = dto.profile_name.trim(); }
    if (dto.profile_nickname !== undefined) { fields.push('#nn = :nn'); names['#nn'] = 'profile_nickname'; values[':nn'] = dto.profile_nickname.trim(); }
    if (dto.profile_birth_date) { fields.push('profile_birth_date = :bd'); values[':bd'] = dto.profile_birth_date; }
    if (dto.cancer_type_id !== undefined) { fields.push('cancer_type_id = :ct'); values[':ct'] = dto.cancer_type_id; }

    if (fields.length === 0) return this.getProfile(userId);

    await this.db.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { profile_id: userId },
      UpdateExpression: `SET ${fields.join(', ')}`,
      ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
      ExpressionAttributeValues: values,
    }));
    return this.getProfile(userId);
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
    { secret: process.env.ACCESS_TOKEN_SECRET, expiresIn: '12h' },
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
    maxAge: 12 * 60 * 60 * 1000,
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

  // ==================== CONVITE REDE DE APOIO ====================

  async createInvite(patientId: string, data: {
    email: string;
    permissions: string[]; // ex: ['agenda', 'diary_read', 'milestones']
  }) {
    const patient = await this.getProfile(patientId);
    if (patient.role === 'support') throw new ForbiddenException('Usuário de suporte não pode convidar');

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 dias

    await this.db.send(new PutCommand({
      TableName: 'CANDIInvites',
      Item: {
        invite_token: token,
        patient_id: patientId,
        patient_name: patient.profile_nickname || patient.profile_name,
        email: data.email,
        permissions: data.permissions,
        expires_at: expiresAt,
        used: false,
        created_at: new Date().toISOString(),
      },
    }));

    // Envia e-mail com o convite
    await this.sendInviteEmail(data.email, patient.profile_nickname || patient.profile_name, token, data.permissions);

    return { message: 'Convite enviado com sucesso!', token };
  }

  async getInvite(token: string) {
    const result = await this.db.send(new GetCommand({
      TableName: 'CANDIInvites',
      Key: { invite_token: token },
    }));
    if (!result.Item) throw new NotFoundException('Convite não encontrado');
    if (result.Item.used) throw new BadRequestException('Este convite já foi utilizado');
    if (new Date(result.Item.expires_at) < new Date()) throw new BadRequestException('Convite expirado');
    return result.Item;
  }

  async registerSupport(body: {
    name: string;
    phone: string;
    email: string;
    password: string;
    invite_token: string;
    relationship: string; // relação com o paciente: familiar, amigo, cônjuge, cuidador, outro
  }) {
    const invite = await this.getInvite(body.invite_token);
    const supportEmail = body.email.toLowerCase().trim();

    // Verifica se já existe conta com esse e-mail
    const existing = await this.db.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'profile_email = :email',
      ExpressionAttributeValues: { ':email': supportEmail },
    }));

    let profileId: string;

    if (existing.Items?.length) {
      const user = existing.Items[0];
      // Se já existe, valida senha e cria apenas o vínculo novo
      const passwordMatch = await bcrypt.compare(body.password, user.profile_password);
      if (!passwordMatch) throw new BadRequestException('Senha incorreta para esta conta');
      if (user.role !== 'support' && user.role !== 'patient')
        throw new BadRequestException('Esta conta não pode ser vinculada como rede de apoio');
      profileId = user.profile_id;
    } else {
      // Cria nova conta com role 'support'
      const hashedPassword = await bcrypt.hash(body.password, 10);
      profileId = randomUUID();
      await this.db.send(new PutCommand({
        TableName: this.tableName,
        Item: {
          profile_id: profileId,
          profile_name: body.name,
          profile_nickname: body.name,
          profile_email: supportEmail,
          profile_phone: body.phone,
          profile_password: hashedPassword,
          role: 'support',
          profile_status: 'active',
        },
      }));
    }

    // Verifica se o vínculo já existe
    const linkExists = await this.db.send(new GetCommand({
      TableName: 'CANDISupportLinks',
      Key: { patient_id: invite.patient_id, support_id: profileId },
    }));
    if (linkExists.Item) throw new BadRequestException('Você já está vinculado a este paciente');

    // Cria o vínculo de apoio (suporte pode ter múltiplos pacientes)
    await this.db.send(new PutCommand({
      TableName: 'CANDISupportLinks',
      Item: {
        patient_id: invite.patient_id,
        support_id: profileId,
        support_name: body.name,
        support_email: supportEmail,
        support_phone: body.phone,
        patient_name: invite.patient_name,
        relationship: body.relationship,
        permissions: invite.permissions,
        status: 'active',
        linked_at: new Date().toISOString(),
      },
    }));

    // Marca o convite como usado
    await this.db.send(new UpdateCommand({
      TableName: 'CANDIInvites',
      Key: { invite_token: body.invite_token },
      UpdateExpression: 'SET #u = :true, used_by = :uid',
      ExpressionAttributeNames: { '#u': 'used' },
      ExpressionAttributeValues: { ':true': true, ':uid': profileId },
    }));

    return { message: 'Vínculo criado com sucesso!', is_new_account: !existing.Items?.length };
  }

  async getMyInvites(patientId: string) {
    const result = await this.db.send(new QueryCommand({
      TableName: 'CANDIInvites',
      IndexName: 'ByPatientGSI',
      KeyConditionExpression: 'patient_id = :pid',
      ExpressionAttributeValues: { ':pid': patientId },
      ScanIndexForward: false,
    }));
    return result.Items || [];
  }

  async getMySupportNetwork(patientId: string) {
    const { QueryCommand: QC } = await import('@aws-sdk/lib-dynamodb');
    const result = await this.db.send(new QueryCommand({
      TableName: 'CANDISupportLinks',
      KeyConditionExpression: 'patient_id = :pid',
      FilterExpression: '#s = :active',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':pid': patientId, ':active': 'active' },
    }));
    return result.Items || [];
  }

  async removeSupportMember(patientId: string, supportId: string) {
    const result = await this.db.send(new QueryCommand({
      TableName: 'CANDISupportLinks',
      KeyConditionExpression: 'patient_id = :pid',
      FilterExpression: 'support_id = :sid',
      ExpressionAttributeValues: { ':pid': patientId, ':sid': supportId },
    }));
    const link = result.Items?.[0];
    if (!link) throw new NotFoundException('Membro não encontrado na rede de apoio');
    await this.db.send(new DeleteCommand({
      TableName: 'CANDISupportLinks',
      Key: { patient_id: patientId, support_id: link.support_id ?? supportId },
    }));
    return { message: 'Membro removido da rede de apoio' };
  }

  async revokeInvite(patientId: string, inviteToken: string) {
    const result = await this.db.send(new QueryCommand({
      TableName: 'CANDIInvites',
      IndexName: 'ByPatientGSI',
      KeyConditionExpression: 'patient_id = :pid',
      FilterExpression: 'invite_token = :tok',
      ExpressionAttributeValues: { ':pid': patientId, ':tok': inviteToken },
    }));
    const invite = result.Items?.[0];
    if (!invite) throw new NotFoundException('Convite não encontrado');
    await this.db.send(new DeleteCommand({
      TableName: 'CANDIInvites',
      Key: { invite_token: inviteToken },
    }));
    return { message: 'Convite revogado' };
  }

  async getMyPatients(supportId: string) {
    // Tenta GSI primeiro; se não existir (tabela criada antes do bootstrap) usa Scan
    let links: any[] = [];
    try {
      const r = await this.db.send(new QueryCommand({
        TableName: 'CANDISupportLinks',
        IndexName: 'BySupportGSI',
        KeyConditionExpression: 'support_id = :sid',
        FilterExpression: '#s = :active',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':sid': supportId, ':active': 'active' },
      }));
      links = r.Items || [];
    } catch {
      // GSI ainda não existe — usa Scan com filtro
      const r = await this.db.send(new ScanCommand({
        TableName: 'CANDISupportLinks',
        FilterExpression: 'support_id = :sid AND #s = :active',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':sid': supportId, ':active': 'active' },
      }));
      links = r.Items || [];
    }
    const patients = await Promise.all(
      links.map(async link => {
        try {
          const patient = await this.getProfile(link.patient_id);
          const { profile_password, ...safe } = patient as any;
          return { ...safe, permissions: link.permissions, linked_at: link.linked_at };
        } catch { return null; }
      }),
    );
    return patients.filter(Boolean);
  }

  // Mantém por compatibilidade — retorna o primeiro paciente
  async getMyPatient(supportId: string) {
    const patients = await this.getMyPatients(supportId);
    return patients[0] ?? null;
  }

  private async sendInviteEmail(to: string, patientName: string, token: string, permissions: string[]) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '465'),
      secure: true,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const permLabels: Record<string, string> = {
      agenda: 'Agenda de consultas',
      diary_read: 'Diário de saúde',
      milestones: 'Marcos do tratamento',
    };
    const permList = permissions.map(p => permLabels[p] || p).join(', ');
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    await transporter.sendMail({
      from: `"CANDI" <${process.env.SMTP_USER}>`,
      to,
      subject: `${patientName} te convidou para a rede de apoio no CANDI`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #759AAB;">Convite para Rede de Apoio</h2>
          <p><strong>${patientName}</strong> te convidou para acompanhar sua jornada no CANDI.</p>
          <p>Com este acesso você poderá ver: <strong>${permList}</strong></p>
          <p>O convite expira em 7 dias.</p>
          <a href="${appUrl}/cadastroSupport?invite=${token}"
             style="background: #759AAB; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 16px 0;">
            Aceitar convite
          </a>
          <p style="color: #888; font-size: 12px;">Se você não reconhece este convite, ignore este e-mail.</p>
        </div>
      `,
    });
  }

}

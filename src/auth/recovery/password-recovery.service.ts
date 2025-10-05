import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PasswordRecoveryService {
  private tableName = process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile';
  // Map armazenando email => { code, timeoutId }
  private codes = new Map<string, { code: string; timeoutId: NodeJS.Timeout }>();

  constructor(
    @Inject('DYNAMO_CLIENT') private readonly db: DynamoDBDocumentClient
  ) {}

  async sendRecoveryCode(email: string) {
    const result = await this.db.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'profile_email = :email',
      ExpressionAttributeValues: { ':email': email },
    }));

    const user = result.Items?.[0];
    if (!user) throw new BadRequestException('Usuário não encontrado');

    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove código antigo caso exista
    const old = this.codes.get(email);
    if (old) clearTimeout(old.timeoutId);

    // Cria timeout para expirar o código em 10 minutos
    const timeoutId = setTimeout(() => this.codes.delete(email), 10 * 60 * 1000);

    this.codes.set(email, { code, timeoutId });
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});


    await transporter.sendMail({
      from: `"CANDI Support" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Código de recuperação de senha',
      text: `Seu código de recuperação é: ${code}`,
    });

    return { message: 'Código enviado para o e-mail' };
  }

  verifyCode(email: string, code: string) {
    const stored = this.codes.get(email);
    if (!stored || stored.code !== code) {
      throw new BadRequestException('Código inválido ou expirado');
    }
    return { message: 'Código verificado com sucesso' };
  }

  async resetPassword(email: string, code: string, newPassword: string) {
    this.verifyCode(email, code);

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const result = await this.db.send(new ScanCommand({
      TableName: this.tableName,
      FilterExpression: 'profile_email = :email',
      ExpressionAttributeValues: { ':email': email },
    }));

    const user = result.Items?.[0];
    if (!user) throw new BadRequestException('Usuário não encontrado');

    await this.db.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { profile_id: user.profile_id },
      UpdateExpression: 'SET profile_password = :pass',
      ExpressionAttributeValues: { ':pass': hashedPassword },
    }));

    // Remove o código do Map após redefinir a senha
    const storedCode = this.codes.get(email);
    if (storedCode) {
      clearTimeout(storedCode.timeoutId);
      this.codes.delete(email);
    }

    return { message: 'Senha atualizada com sucesso' };
  }
}

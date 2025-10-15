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
      text: `
      
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Código de Recuperação</title>
    <link href="https://fonts.googleapis.com/css2?family=Kadwa:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'Inter', sans-serif;
            background-color: white;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 0;
        }

        .container {
            width: 100%;
            height: 100vh;
            background-color: white;
            border-radius: 0;
            overflow: hidden;
            box-shadow: none;
        }

        .header {
            position: relative;
            height: 120px;
            background: #CFFFE5;
            overflow: hidden;
        }

        .wave {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: auto;
        }

        .content {
            padding: 50px 40px 60px;
            position: relative;
            z-index: 1;
        }

        h1 {
            font-size: 32px;
            font-weight: 700;
            color: #2d3436;
            margin-bottom: 30px;
            line-height: 1.3;
            font-family: 'Kadwa', serif;
        }

        .code-box {
            text-align: center;
            margin: 40px 0;
        }

        .code {
            font-size: 48px;
            font-weight: 700;
            color: #b0b0b0;
            letter-spacing: 8px;
            font-family: 'Kadwa', serif;
        }

        .disclaimer {
            text-align: center;
            margin-top: 35px;
            font-size: 14px;
            color: #666;
            line-height: 1.6;
            font-family: 'Inter', sans-serif;
        }

        .footer {
            display: flex;
            justify-content: flex-end;
            padding: 0 40px 30px;
        }

        .logo {
            width: 140px;
            height: auto;
            display: block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <svg class="wave" viewBox="0 0 1002 250" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
                <path d="M 0,0 L 0,160 
                   Q 250.5,250 501,200
                   T 1002,200 L 1002,0 Z" fill="#CFFFE5"/>
                <path d="M 0,0 L 0,225 
                   Q 250.5,250 501,220
                   T 1002,225 L 1002,0 Z" fill="#FFC4C4"/>
            </svg>
        </div>
        
        <div class="content">
            <h1>Olá!<br>Seu código de<br>recuperação é:</h1>
            
            <div class="code-box">
                <div class="code">${code}</div>
            </div>
            
            <p class="disclaimer">Se você não solicitou essa recuperação, ignore este e-mail.</p>
        </div>

        <div class="footer">
            <image src="logo.png" style="width: 20%; height: 20%; margin-top: 15%;"/>
        </div>
    </div>
</body>
</html>

      `,
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

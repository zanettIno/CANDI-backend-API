import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private tableName = process.env.DYNAMO_TABLE || 'CANDIProfile';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async register(user: {
    name: string;
    nickname: string;
    email: string;
    password: string;
    birth_date: string;
    cancer_type_id: number;
  }) {
    // Verificar se email já existe usando índice secundário
    const existing = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': user.email },
      }),
    );

    if (existing.Items && existing.Items.length > 0) {
      throw new BadRequestException('E-mail já cadastrado');
    }

    // Hash da senha
    const hashedPassword = await bcrypt.hash(user.password, 10);

    const newUser = {
      profile_id: randomUUID(),
      name: user.name,
      nickname: user.nickname,
      email: user.email,
      password: hashedPassword,
      birth_date: user.birth_date,
      cancer_type_id: user.cancer_type_id,
    };

    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: newUser,
      }),
    );

    // Nunca retornar o hash
    const { password, ...result } = newUser;
    return { message: 'Usuário registrado com sucesso', user: result };
  }
}

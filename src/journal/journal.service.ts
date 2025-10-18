import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';

import { randomUUID } from 'crypto';
import { AuthService } from '../auth/auth.service'; // Importe o AuthService

interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
}

@Injectable()
export class JournalService {
  private readonly tableName = 'CANDIFeelings';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
    private readonly authService: AuthService, // Injete o AuthService
  ) {}

  async addFeeling(user: AuthenticatedUser, payload: { happiness: number; observation: string }) {
    if (!payload.observation || payload.observation.trim() === '') {
      throw new BadRequestException('A observação é obrigatória.');
    }
    
    const newFeeling = {
      feeling_id: randomUUID(),
      profile_id: user.profile_id,
      email: user.profile_email,
      happiness: payload.happiness,
      observation: payload.observation,
      created_at: new Date().toISOString(),
    };

    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: newFeeling,
      }),
    );

    return newFeeling;
  }

  // O método agora busca por e-mail

  async getFeelingsByEmail(email: string, user: AuthenticatedUser) {
    // Valida se o usuário com este e-mail existe
    await this.authService.findProfileByEmail(email);

    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex', // Requer um GSI na tabela CANDIFeelings
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': user.profile_email },
      }),
    );

    const items = result.Items || [];
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return items;
  }
}
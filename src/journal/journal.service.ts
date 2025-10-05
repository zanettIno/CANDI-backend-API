import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

import { AuthService } from '../auth/auth.service'; // Importe o AuthService


@Injectable()
export class JournalService {
  private readonly tableName = 'CANDIFeelings';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
    private readonly authService: AuthService, // Injete o AuthService
  ) {}

  // O método agora recebe o e-mail no corpo (payload)
  async addFeeling(payload: { email: string; happiness: number; observation: string }) {
    // Valida o usuário e obtém o perfil completo a partir do e-mail
    const profile = await this.authService.findProfileByEmail(payload.email);

    const newFeeling = {
      feeling_id: randomUUID(),
      profile_id: profile.profile_id, // Guarda o ID do perfil encontrado
      email: profile.profile_email,   // Guarda o e-mail validado
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

  async getFeelingsByEmail(email: string) {
    // Valida se o usuário com este e-mail existe
    await this.authService.findProfileByEmail(email);

    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex', // Requer um GSI na tabela CANDIFeelings
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );

    const items = result.Items || [];
    // Ordena para mostrar os mais recentes primeiro
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return items;
  }
}
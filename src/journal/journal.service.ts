import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// Interface para o objeto de usuário que o AuthGuard anexa
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
  ) {} // O AuthService foi removido, o Guard faz a validação

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

  async getFeelingsByUser(user: AuthenticatedUser) {
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
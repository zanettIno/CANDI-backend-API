import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// Interface para o objeto de usuário que o AuthGuard anexa ao pedido
interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
}

@Injectable()
export class SymptomsService {
  private readonly tableName = 'CANDISymptoms';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {} // O AuthService foi removido, pois o Guard já faz a validação do usuário

  async addSymptom(user: AuthenticatedUser, description: string) {
    if (!description || description.trim() === '') {
      throw new BadRequestException('A descrição do sintoma é obrigatória');
    }

    const newSymptom = {
      symptoms_id: randomUUID(),
      profile_id: user.profile_id,     
      email: user.profile_email,      
      description: description,
      created_at: new Date().toISOString(),
    };

    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: newSymptom,
      }),
    );

    return {
      message: 'Sintoma registrado com sucesso',
      symptom: newSymptom,
    };
  }

  async listSymptomsByUser(user: AuthenticatedUser) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': user.profile_email },
      }),
    );

    const items = result.Items || [];
    // Ordena para mostrar os mais recentes primeiro
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return items;
  }
}
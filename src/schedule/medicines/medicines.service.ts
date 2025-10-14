import { Injectable, Inject } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// Interface para o payload do create
interface CreateMedicinePayload {
  medicine_name: string;
  medicine_dosage: string;
  medicine_period: string;
  medicine_posology: string;
  medicine_obs?: string;
}

// Interface para o objeto de usuário que o AuthGuard anexa
interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
}

@Injectable()
export class MedicinesService {
  private readonly tableName = 'CANDIMedicines';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {} // O AuthService não é mais necessário aqui, pois o Guard já faz a validação

  async create(user: AuthenticatedUser, payload: CreateMedicinePayload) {
    // Já recebemos o 'user' validado pelo AuthGuard
    const newMedicine = {
      medicine_id: randomUUID(),
      profile_id: user.profile_id,
      email: user.profile_email,
      medicine_name: payload.medicine_name,
      medicine_dosage: payload.medicine_dosage,
      medicine_period: payload.medicine_period,
      medicine_posology: payload.medicine_posology,
      medicine_obs: payload.medicine_obs || '',
      created_at: new Date().toISOString(),
    };

    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: newMedicine,
      }),
    );

    return {
      message: 'Medicamento registado com sucesso',
      medicine: newMedicine,
    };
  }

  async findAllByEmail(email: string) {
    // A validação de usuário agora é feita pelo AuthGuard no controller
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );
    
    const items = result.Items || [];
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return items;
  }

  // Métodos placeholder
  findOne(id: number) { /* ... */ }
  update(id: number, payload: any) { /* ... */ }
  remove(id: number) { /* ... */ }
}
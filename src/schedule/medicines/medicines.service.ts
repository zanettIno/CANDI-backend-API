import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { AuthService } from '../../auth/auth.service';
import { randomUUID } from 'crypto';

@Injectable()
export class MedicinesService {
  private readonly tableName = 'CANDIMedicines';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
    private readonly authService: AuthService,
  ) {}

  async create(payload: {
    email: string;
    medicine_name: string;
    medicine_dosage: string;
    medicine_period: string;
    medicine_posology: string;
    medicine_obs?: string;
  }) {
    // Valida o usuário e obtém o perfil completo a partir do e-mail
    const profile = await this.authService.findProfileByEmail(payload.email);

    const newMedicine = {
      medicine_id: randomUUID(),
      profile_id: profile.profile_id,
      email: profile.profile_email,
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
    // Valida se o usuário com este e-mail existe
    await this.authService.findProfileByEmail(email);

    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex', // Requer um GSI na tabela CandiMedicines
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );
    
    const items = result.Items || [];
    // Ordena os resultados para mostrar os mais recentes primeiro
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    return items;
  }

  // Métodos placeholder gerados pela CLI
  findOne(id: number) {
    return `This action returns a #${id} medicine`;
  }

  update(id: number, payload: any) {
    return `This action updates a #${id} medicine`;
  }

  remove(id: number) {
    return `This action removes a #${id} medicine`;
  }
}
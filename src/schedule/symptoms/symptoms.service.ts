import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { AuthService } from '../../auth/auth.service'; 

@Injectable()
export class SymptomsService {
  private tableName = process.env.DYNAMO_SYMPTOMS_TABLE || 'CANDISymptoms';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
    private readonly authService: AuthService,
  ) {}

  async addSymptom(symptom: { email: string; description: string }) {
    if (!symptom.email || !symptom.description) {
      throw new BadRequestException('email e description são obrigatórios');
    }

    const profile = await this.authService.findProfileByEmail(symptom.email);

    const newSymptom = {
      symptoms_id: randomUUID(),
      profile_id: profile.profile_id,     
      email: profile.profile_email,      
      description: symptom.description,
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

  async listSymptomsByEmail(email: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );

    return result.Items || [];
  }
}
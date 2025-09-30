import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

@Injectable()
export class SymptomsService {
  private tableName = process.env.DYNAMO_SYMPTOMS_TABLE || 'CANDISymptoms';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async addSymptom(symptom: {
    profile_id: string;   
    description: string;  
  }) {
    if (!symptom.profile_id || !symptom.description) {
      throw new BadRequestException('profile_id e description são obrigatórios');
    }

    const newSymptom = {
      symptoms_id: randomUUID(),
      profile_id: symptom.profile_id,
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

  async listSymptomsByProfile(profile_id: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'profile_id = :pid',
        ExpressionAttributeValues: {
          ':pid': profile_id,
        },
      }),
    );

    return result.Items || [];
  }
}

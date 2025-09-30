import { Injectable, Inject } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

@Injectable()
export class JournalService {
  private tableName = 'CANDIFeelings';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async addFeeling(profile_id: string, data: { happiness: number; observation: string }) {
    const newFeeling = {
      feeling_id: randomUUID(),
      profile_id,
      happiness: data.happiness,
      observation: data.observation,
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

  async getFeelings(profile_id: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'ProfileFeelingsIndex',
        KeyConditionExpression: 'profile_id = :pid',
        ExpressionAttributeValues: { ':pid': profile_id },
      }),
    );

    return result.Items || [];
  }
}

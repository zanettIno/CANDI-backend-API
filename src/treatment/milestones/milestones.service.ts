import { Injectable, Inject } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

@Injectable()
export class MilestonesService {
  private readonly tableName = 'CANDITreatmentMilestones';
  private readonly indexName = 'ProfileMilestonesIndex';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async createMilestone(profile_id: string, data: {
    title: string;
    description?: string;
    date?: string;
    type?: 'fixed' | 'custom';
    position?: number | null;
  }) {
    const item = {
      milestone_id: randomUUID(),
      profile_id,
      title: data.title,
      description: data.description || '',
      date: data.date || new Date().toISOString(),
      type: data.type || 'custom',
      position: data.position ?? null,
      created_at: new Date().toISOString(),
    };

    await this.db.send(new PutCommand({ TableName: this.tableName, Item: item }));

    return { message: 'Marco criado com sucesso', milestone: item };
  }

  async listMilestones(profile_id: string) {
    try {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.indexName,
          KeyConditionExpression: 'profile_id = :pid',
          ExpressionAttributeValues: { ':pid': profile_id },
        }),
      );

      const milestones = result.Items || [];
      milestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const fixedCount = 4;
      const fixedDone = milestones.filter(m => m.type === 'fixed').length;
      const customCount = milestones.filter(m => m.type === 'custom').length;
      const progress = Math.min(100, Math.round((fixedDone / fixedCount) * 100) + customCount * 5);

      return { milestones, progress };
    } catch {
      const result = await this.db.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'profile_id = :pid',
          ExpressionAttributeValues: { ':pid': profile_id },
        }),
      );

      const milestones = result.Items || [];
      milestones.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      const fixedCount = 4;
      const fixedDone = milestones.filter(m => m.type === 'fixed').length;
      const customCount = milestones.filter(m => m.type === 'custom').length;
      const progress = Math.min(100, Math.round((fixedDone / fixedCount) * 100) + customCount * 5);

      return { milestones, progress };
    }
  }
}

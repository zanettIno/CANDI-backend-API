import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
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

  private calcProgress(milestones: any[]): number {
    if (!milestones.length) return 0;
    const done = milestones.filter(m => m.type === 'fixed').length;
    return Math.round((done / milestones.length) * 100);
  }

  async updateMilestone(milestone_id: string, profile_id: string, data: {
    title?: string;
    description?: string;
    date?: string;
    type?: 'fixed' | 'custom';
  }) {
    const existing = await this.db.send(new GetCommand({
      TableName: this.tableName,
      Key: { milestone_id },
    }));
    if (!existing.Item || existing.Item.profile_id !== profile_id) {
      throw new NotFoundException('Marco não encontrado');
    }

    const updates: string[] = [];
    const values: Record<string, any> = {};
    const names: Record<string, string> = {};

    if (data.title !== undefined) { updates.push('#t = :t'); names['#t'] = 'title'; values[':t'] = data.title; }
    if (data.description !== undefined) { updates.push('#d = :d'); names['#d'] = 'description'; values[':d'] = data.description; }
    if (data.date !== undefined) { updates.push('#dt = :dt'); names['#dt'] = 'date'; values[':dt'] = data.date; }
    if (data.type !== undefined) { updates.push('#ty = :ty'); names['#ty'] = 'type'; values[':ty'] = data.type; }

    if (!updates.length) return { message: 'Nada a atualizar' };

    await this.db.send(new UpdateCommand({
      TableName: this.tableName,
      Key: { milestone_id },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));

    return { message: 'Marco atualizado com sucesso' };
  }

  async deleteMilestone(milestone_id: string, profile_id: string) {
    const existing = await this.db.send(new GetCommand({
      TableName: this.tableName,
      Key: { milestone_id },
    }));
    if (!existing.Item || existing.Item.profile_id !== profile_id) {
      throw new NotFoundException('Marco não encontrado');
    }

    await this.db.send(new DeleteCommand({
      TableName: this.tableName,
      Key: { milestone_id },
    }));

    return { message: 'Marco excluído com sucesso' };
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
      const progress = this.calcProgress(milestones);
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
      const progress = this.calcProgress(milestones);
      return { milestones, progress };
    }
  }
}

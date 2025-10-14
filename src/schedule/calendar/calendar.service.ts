import { Injectable, Inject } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

@Injectable()
export class CalendarService {
  private readonly tableName = 'CANDIAppointment';
  private readonly indexName = 'ProfileAppointmentsIndex';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  // Criar evento no calendário
  async createEvent(profile_id: string, data: {
    appointment_name: string;
    appointment_date: string;
    appointment_time: string;
    local?: string;
    observation?: string;
  }) {
    const newEvent = {
      appointment_id: randomUUID(),
      profile_id,
      appointment_name: data.appointment_name,
      appointment_date: data.appointment_date,
      appointment_time: data.appointment_time,
      local: data.local || '',
      observation: data.observation || '',
      created_at: new Date().toISOString(),
    };

    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: newEvent,
      }),
    );

    return { message: 'Compromisso criado com sucesso', event: newEvent };
  }

  // Buscar todos os eventos do paciente
  async listEvents(profile_id: string) {
    try {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.indexName,
          KeyConditionExpression: 'profile_id = :pid',
          ExpressionAttributeValues: { ':pid': profile_id },
        }),
      );
      const items = result.Items || [];
      items.sort((a, b) =>
        new Date(`${a.appointment_date}T${a.appointment_time}:00Z`).getTime() -
        new Date(`${b.appointment_date}T${b.appointment_time}:00Z`).getTime()
      );
      return items;
    } catch {
      // fallback caso o índice ainda não esteja ativo
      const scan = await this.db.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'profile_id = :pid',
          ExpressionAttributeValues: { ':pid': profile_id },
        }),
      );
      return scan.Items || [];
    }
  }

  // Resumo mensal — quantos eventos por dia
  async getMonthlySummary(profile_id: string) {
    const events = await this.listEvents(profile_id);
    const summary = events.reduce((acc, event) => {
      const date = event.appointment_date;
      acc[date] = acc[date] ? acc[date] + 1 : 1;
      return acc;
    }, {});

    // Formato usado pelo react-native-calendars
    const formatted = Object.keys(summary).reduce((acc, date) => {
      acc[date] = { marked: true, dotColor: 'blue', events: summary[date] };
      return acc;
    }, {});

    return formatted;
  }
}

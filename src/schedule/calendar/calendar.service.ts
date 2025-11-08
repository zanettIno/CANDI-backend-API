import { Injectable, Inject } from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// Interface para o objeto de usuário que o AuthGuard anexa
interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
}

// Interface para os dados do evento
interface EventData {
  appointment_name: string;
  appointment_date: string;
  appointment_time: string;
  local?: string;
  observation?: string;
}

@Injectable()
export class CalendarService {
  private readonly tableName = 'CANDIAppointment';
  private readonly indexName = 'EmailIndex'; // ALTERADO: Vamos usar o EmailIndex padronizado

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async createEvent(user: AuthenticatedUser, data: EventData) {
    const newEvent = {
      appointment_id: randomUUID(),
      profile_id: user.profile_id,
      email: user.profile_email, // ADICIONADO: Salvamos o email para consistência
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

  async listEvents(user: AuthenticatedUser) {
    try {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: this.indexName, // ALTERADO
          KeyConditionExpression: 'email = :email', // ALTERADO
          ExpressionAttributeValues: { ':email': user.profile_email }, // ALTERADO
        }),
      );
      const items = result.Items || [];
      // Ordena por data/hora do compromisso
      items.sort((a, b) =>
        new Date(`${a.appointment_date}T${a.appointment_time}:00`).getTime() -
        new Date(`${b.appointment_date}T${b.appointment_time}:00`).getTime()
      );
      return items;
    } catch (error) {
      // Fallback em caso de erro (ex: índice não pronto)
      console.error("Falha ao consultar índice do calendário, usando Scan:", error);
      const scan = await this.db.send(
        new ScanCommand({
          TableName: this.tableName,
          FilterExpression: 'profile_id = :pid',
          ExpressionAttributeValues: { ':pid': user.profile_id },
        }),
      );
      return scan.Items || [];
    }
  }

  async getMonthlySummary(user: AuthenticatedUser) {
    const events = await this.listEvents(user);
    const summary = events.reduce((acc, event) => {
      const date = event.appointment_date;
      acc[date] = acc[date] ? acc[date] + 1 : 1;
      return acc;
    }, {});

    const formatted = Object.keys(summary).reduce((acc, date) => {
      acc[date] = { marked: true, dotColor: 'blue', events: summary[date] };
      return acc;
    }, {});

    return formatted;
  }
}
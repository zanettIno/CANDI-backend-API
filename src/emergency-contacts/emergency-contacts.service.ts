import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// Interface para o objeto de usuário que o AuthGuard anexa
interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
}

// Interface para os dados do novo contato
interface CreateContactPayload {
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relationship: string;
}

@Injectable()
export class EmergencyContactsService {
  private readonly tableName = 'CandiEmergencyContacts';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async createContact(user: AuthenticatedUser, payload: CreateContactPayload) {
    const newContact = {
      // --- CORREÇÃO AQUI ---
      emergency_id: randomUUID(), // Renomeado de contact_id para emergency_id
      // --- FIM DA CORREÇÃO ---
      profile_id: user.profile_id,
      email: user.profile_email,
      name: payload.emergency_contact_name,
      phone: payload.emergency_contact_phone,
      relationship: payload.emergency_contact_relationship,
      created_at: new Date().toISOString(),
    };

    await this.db.send(
      new PutCommand({
        TableName: this.tableName,
        Item: newContact,
      }),
    );

    return { message: 'Contato adicionado com sucesso', contact: newContact };
  }

  async listContacts(user: AuthenticatedUser) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': user.profile_email },
      }),
    );

    const items = result.Items || [];
    items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return items;
  }
}
// src/chat/chat.service.ts
import { Injectable, Inject, NotFoundException, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, TransactWriteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
  profile_name: string;
  profile_nickname: string;
}

@Injectable()
export class ChatService {
  private readonly messagesTable = 'CANDIMessages';
  private readonly conversationsTable = 'CANDIUserConversations';
  private readonly profileTable = 'CANDIProfile'; 

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  private getConversationId(id1: string, id2: string): string {
    return [id1, id2].sort().join('#');
  }

  private async getProfileById(profileId: string): Promise<any> {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.profileTable,
        Key: { profile_id: profileId },
      }),
    );
    if (!result.Item) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return result.Item;
  }

  /**
   * Busca um perfil de usuário pelo email (usado para iniciar chat).
   */
  private async getProfileByEmail(email: string): Promise<any> {
    const result = await this.db.send(
      new ScanCommand({ 
        TableName: this.profileTable,
        FilterExpression: 'profile_email = :email',
        ExpressionAttributeValues: { ':email': email },
      }),
    );
    const user = result.Items?.[0];
    if (!user) {
      throw new NotFoundException('Usuário com este e-mail não foi encontrado');
    }
    return user;
  }


  async getInbox(profileId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.conversationsTable,
        IndexName: 'InboxSortGSI',
        KeyConditionExpression: 'profile_id = :pid',
        ExpressionAttributeValues: { ':pid': profileId },
        ScanIndexForward: false,
      }),
    );
    return result.Items || [];
  }


  async getMessages(profileId: string, conversationId: string) {
    await this.checkUserInConversation(profileId, conversationId);

    const result = await this.db.send(
      new QueryCommand({
        TableName: this.messagesTable,
        KeyConditionExpression: 'conversation_id = :cid',
        ExpressionAttributeValues: { ':cid': conversationId },
        ScanIndexForward: true,
      }),
    );
    
    // Zera o contador de não lidas para o usuário logado
    await this.db.send(new UpdateCommand({
        TableName: this.conversationsTable,
        Key: { profile_id: profileId, conversation_id: conversationId },
        UpdateExpression: 'SET unread_count = :zero',
        ExpressionAttributeValues: { ':zero': 0 },
        ConditionExpression: 'attribute_exists(profile_id)'
    })).catch(err => {
      if (err.name !== 'ConditionalCheckFailedException') {
        console.error("Erro ao zerar contador:", err);
      }
    });

    return result.Items || [];
  }

  /**
   * Função pública chamada pelo Controller para iniciar a conversa por EMAIL.
   */
  async findOrCreateConversationByEmail(user: AuthenticatedUser, otherUserEmail: string) {
    // 1. Encontra o outro usuário pelo email
    const otherUser = await this.getProfileByEmail(otherUserEmail);
    
    // 2. Chama a lógica de criação (função privada)
    return this.findOrCreateConversationInternal(user, otherUser);
  }

  /**
   * Lógica interna de criação/busca de conversa (marcada como privada).
   */
  private async findOrCreateConversationInternal(user: AuthenticatedUser, otherUser: any) {
    const myProfileId = user.profile_id;
    const otherProfileId = otherUser.profile_id;
    const conversationId = this.getConversationId(myProfileId, otherProfileId);

    // Tenta buscar a conversa para o usuário logado
    const existing = await this.db.send(
      new GetCommand({
        TableName: this.conversationsTable,
        Key: { profile_id: myProfileId, conversation_id: conversationId },
      }),
    );

    if (existing.Item) {
      return existing.Item; 
    }
    
    const now = new Date().toISOString();

    const myConversationEntry = {
      profile_id: myProfileId,
      conversation_id: conversationId,
      other_user_id: otherProfileId,
      other_user_name: otherUser.profile_nickname || otherUser.profile_name,
      last_message: '',
      last_message_timestamp: now,
      unread_count: 0,
    };
    
    const otherConversationEntry = {
      profile_id: otherProfileId,
      conversation_id: conversationId,
      other_user_id: myProfileId,
      other_user_name: user.profile_nickname || user.profile_name,
      last_message: '',
      last_message_timestamp: now,
      unread_count: 0,
    };

    await this.db.send(new PutCommand({ TableName: this.conversationsTable, Item: myConversationEntry }));
    await this.db.send(new PutCommand({ TableName: this.conversationsTable, Item: otherConversationEntry }));

    return myConversationEntry;
  }

  async sendMessage(user: AuthenticatedUser, conversationId: string, messageContent: string) {
    const { profile_id, profile_name, profile_nickname } = user;
    const now = new Date().toISOString();
    
    const conversationEntry = await this.checkUserInConversation(profile_id, conversationId);
    const otherProfileId = conversationEntry.other_user_id;

    // 1. Nova Mensagem
    const newMessage = {
      conversation_id: conversationId,
      timestamp: `${now}#${randomUUID()}`, // Chave de classificação única
      sender_id: profile_id,
      sender_name: profile_nickname || profile_name,
      message_content: messageContent,
    };

    // 2. Atualização do Inbox do Remetente
    const myInboxUpdate = {
        TableName: this.conversationsTable,
        Key: { profile_id: profile_id, conversation_id: conversationId },
        UpdateExpression: 'SET last_message = :msg, last_message_timestamp = :ts',
        ExpressionAttributeValues: { ':msg': messageContent, ':ts': now }
    };
    
    // 3. Atualização do Inbox do Destinatário (+1 não lida)
    const otherInboxUpdate = {
        TableName: this.conversationsTable,
        Key: { profile_id: otherProfileId, conversation_id: conversationId },
        UpdateExpression: 'SET last_message = :msg, last_message_timestamp = :ts, unread_count = if_not_exists(unread_count, :init) + :inc', // Garante que o campo exista
        ExpressionAttributeValues: { ':msg': messageContent, ':ts': now, ':inc': 1, ':init': 0 }
    };

    try {
      await this.db.send(new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.messagesTable, Item: newMessage } },
          { Update: myInboxUpdate },
          { Update: otherInboxUpdate }
        ]
      }));
      
      return newMessage;
    } catch (error) {
        console.error("Erro na transação de envio de mensagem:", error);
        throw new InternalServerErrorException('Não foi possível enviar a mensagem');
    }
  }

  private async checkUserInConversation(profileId: string, conversationId: string) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.conversationsTable,
        Key: { profile_id: profileId, conversation_id: conversationId },
      }),
    );

    if (!result.Item) {
      throw new UnauthorizedException('Acesso negado a esta conversa');
    }
    return result.Item;
  }
}
// src/chat/chat.service.ts
import { Injectable, Inject, NotFoundException, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand, UpdateCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';

// Interface do usuário vinda do AuthGuard
interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
  profile_name: string;
  profile_nickname: string;
}

@Injectable()
export class ChatService {
  // Nomes das tabelas que criamos
  private readonly messagesTable = 'CANDIMessages';
  private readonly conversationsTable = 'CANDIUserConversations';
  private readonly profileTable = 'CANDIProfile'; // Tabela de perfis que você já usa

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  /**
   * (Helper) Gera um ID de conversa 1-para-1.
   * Garante que o ID seja o mesmo, independente de quem começa.
   */
  private getConversationId(id1: string, id2: string): string {
    return [id1, id2].sort().join('#');
  }

  /**
   * (Helper) Busca um perfil de usuário no DynamoDB
   */
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
   * (Tela 2) Busca a caixa de entrada (lista de conversas)
   */
  async getInbox(profileId: string) {
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.conversationsTable,
        IndexName: 'InboxSortGSI', // Nosso GSI para ordenar por data
        KeyConditionExpression: 'profile_id = :pid',
        ExpressionAttributeValues: { ':pid': profileId },
        ScanIndexForward: false, // Mais recentes primeiro
      }),
    );
    return result.Items || [];
  }

  /**
   * (Tela 3) Busca mensagens de uma conversa específica
   */
  async getMessages(profileId: string, conversationId: string) {
    // 1. (Segurança) Verificamos se o usuário pertence a esta conversa
    await this.checkUserInConversation(profileId, conversationId);

    // 2. Busca as mensagens
    const result = await this.db.send(
      new QueryCommand({
        TableName: this.messagesTable,
        KeyConditionExpression: 'conversation_id = :cid',
        ExpressionAttributeValues: { ':cid': conversationId },
        ScanIndexForward: true, // Mais antigas primeiro
      }),
    );
    
    // (Opcional) Zerar o contador de não lidas
    await this.db.send(new UpdateCommand({
        TableName: this.conversationsTable,
        Key: { profile_id: profileId, conversation_id: conversationId },
        UpdateExpression: 'SET unread_count = :zero',
        ExpressionAttributeValues: { ':zero': 0 }
    }));

    return result.Items || [];
  }

  /**
   * Busca (ou cria) uma conversa 1-para-1
   */
  async findOrCreateConversation(user: AuthenticatedUser, otherProfileId: string) {
    const myProfileId = user.profile_id;
    const conversationId = this.getConversationId(myProfileId, otherProfileId);

    // 1. Verifica se a conversa já existe na *minha* caixa de entrada
    const existing = await this.db.send(
      new GetCommand({
        TableName: this.conversationsTable,
        Key: {
          profile_id: myProfileId,
          conversation_id: conversationId,
        },
      }),
    );

    if (existing.Item) {
      return existing.Item; // Conversa já existe
    }
    
    // 2. Se não existe, precisamos criar as entradas para ambos os usuários
    // Precisamos dos dados do outro usuário
    const otherUser = await this.getProfileById(otherProfileId);
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

    // 3. Salva ambas as entradas
    await this.db.send(new PutCommand({
        TableName: this.conversationsTable,
        Item: myConversationEntry
    }));
    await this.db.send(new PutCommand({
        TableName: this.conversationsTable,
        Item: otherConversationEntry
    }));

    return myConversationEntry;
  }

  /**
   * (Tela 3) Envia uma nova mensagem
   */
  async sendMessage(user: AuthenticatedUser, conversationId: string, messageContent: string) {
    const { profile_id, profile_name, profile_nickname } = user;
    const now = new Date().toISOString();
    
    // 1. (Segurança) Verificamos se o usuário pode enviar nesta conversa
    const conversationEntry = await this.checkUserInConversation(profile_id, conversationId);
    const otherProfileId = conversationEntry.other_user_id;

    // 2. Define o item da nova mensagem
    const newMessage = {
      conversation_id: conversationId,
      timestamp: `${now}#${randomUUID()}`, // Garante unicidade no SK
      sender_id: profile_id,
      sender_name: profile_nickname || profile_name,
      message_content: messageContent,
    };

    // 3. Define as atualizações para as caixas de entrada (minha e do outro)
    const myInboxUpdate = {
        TableName: this.conversationsTable,
        Key: { profile_id: profile_id, conversation_id: conversationId },
        UpdateExpression: 'SET last_message = :msg, last_message_timestamp = :ts',
        ExpressionAttributeValues: { ':msg': messageContent, ':ts': now }
    };
    
    const otherInboxUpdate = {
        TableName: this.conversationsTable,
        Key: { profile_id: otherProfileId, conversation_id: conversationId },
        UpdateExpression: 'SET last_message = :msg, last_message_timestamp = :ts, unread_count = unread_count + :inc',
        ExpressionAttributeValues: { ':msg': messageContent, ':ts': now, ':inc': 1 }
    };

    // 4. Executa tudo em uma transação para garantir consistência
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

  /**
   * (Helper de Segurança) Verifica se um usuário pertence a uma conversa
   */
  private async checkUserInConversation(profileId: string, conversationId: string) {
    const result = await this.db.send(
      new GetCommand({
        TableName: this.conversationsTable,
        Key: {
          profile_id: profileId,
          conversation_id: conversationId,
        },
      }),
    );

    if (!result.Item) {
      throw new UnauthorizedException('Acesso negado a esta conversa');
    }
    return result.Item;
  }
}
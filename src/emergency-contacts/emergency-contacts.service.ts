import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';

@Injectable()
export class EmergencyContactsService {
  private readonly tableName = process.env.DYNAMO_USERS_TABLE || 'CANDIProfile'; // Nome da tabela ajustado, se necessário

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async update(userId: string, contactDto: UpdateEmergencyContactsDto) {
    const command = new UpdateCommand({
      TableName: this.tableName,
      // CORRIGIDO: A chave agora usa 'profile_id' para corresponder ao schema da sua tabela.
      Key: {
        profile_id: userId,
      },
      // CORRIGIDO: O nome do atributo 'relationship' foi ajustado para 'rela'.
      UpdateExpression:
        'SET emergency_contact_name = :name, emergency_contact_phone = :phone, emergency_contact_rela = :rela',
      
      // CORRIGIDO: O placeholder foi atualizado para ':rela'.
      ExpressionAttributeValues: {
        ':name': contactDto.emergency_contact_name,
        ':phone': contactDto.emergency_contact_phone,
        ':rela': contactDto.emergency_contact_relationship,
      },
      ReturnValues: 'UPDATED_NEW',
    });

    try {
      const result = await this.db.send(command);
      
      if (!result.Attributes) {
        throw new NotFoundException(`Usuário com ID "${userId}" não encontrado.`);
      }

      return {
        message: 'Contato de emergência atualizado com sucesso!',
        updatedAttributes: result.Attributes,
      };
    } catch (error) {
        console.error("Erro ao atualizar no DynamoDB:", error);
        if (error.name === 'ConditionalCheckFailedException') {
            throw new NotFoundException(`Usuário com ID "${userId}" não encontrado.`);
        }
        // Relança outros erros (como ValidationException se algo ainda estiver errado)
        throw error;
    }
  }
}
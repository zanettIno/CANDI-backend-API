import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';

// Interface para o objeto de usuário que o AuthGuard anexa
interface AuthenticatedUser {
  profile_id: string;
}

@Injectable()
export class EmergencyContactsService {
  private readonly tableName = 'CANDIProfile'; 

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  async update(user: AuthenticatedUser, contactDto: UpdateEmergencyContactsDto) {
    const command = new UpdateCommand({
      TableName: this.tableName,
      Key: {
        // Usamos o ID que vem do usuário autenticado pelo token
        profile_id: user.profile_id,
      },
      UpdateExpression:
        'SET emergency_contact_name = :name, emergency_contact_phone = :phone, emergency_contact_rela = :rela',
      
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
        throw new NotFoundException(`Usuário não encontrado.`);
      }

      return {
        message: 'Contato de emergência atualizado com sucesso!',
        updatedAttributes: result.Attributes,
      };
    } catch (error) {
        console.error("Erro ao atualizar no DynamoDB:", error);
        if (error.name === 'ConditionalCheckFailedException') {
            throw new NotFoundException(`Usuário não encontrado.`);
        }
        throw error;
    }
  }
}
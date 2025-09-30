import { Test, TestingModule } from '@nestjs/testing';
import { EmergencyContactsService } from './emergency-contacts.service';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';
import { NotFoundException } from '@nestjs/common';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('EmergencyContactsService', () => {
  let service: EmergencyContactsService;

  beforeEach(async () => {
    ddbMock.reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyContactsService,
        {
          provide: 'DYNAMO_CLIENT',
          useValue: ddbMock,
        },
      ],
    }).compile();

    service = module.get<EmergencyContactsService>(EmergencyContactsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('update', () => {
    const userId = 'user-123';
    const contactDto: UpdateEmergencyContactsDto = {
      emergency_contact_name: 'Maria Silva',
      emergency_contact_phone: '11999998888',
      emergency_contact_relationship: 'Mãe',
    };

    it('should update emergency contacts successfully', async () => {
      const updatedAttributes = {
        emergency_contact_name: 'Maria Silva',
      };
      // Simula uma resposta de sucesso do DynamoDB
      ddbMock.on(UpdateCommand).resolves({ Attributes: updatedAttributes });

      const result = await service.update(userId, contactDto);

      expect(result.message).toBe('Contato de emergência atualizado com sucesso!');
      expect(result.updatedAttributes).toEqual(updatedAttributes);

      // Verifica se o comando foi chamado com os parâmetros corretos
      expect(ddbMock).toHaveReceivedCommandWith(UpdateCommand, {
        TableName: 'CANDIUsers',
        Key: { user_id: userId },
        UpdateExpression: 'SET emergency_contact_name = :name, emergency_contact_phone = :phone, emergency_contact_relationship = :relationship',
        ExpressionAttributeValues: {
            ':name': contactDto.emergency_contact_name,
            ':phone': contactDto.emergency_contact_phone,
            ':relationship': contactDto.emergency_contact_relationship,
        },
      });
    });

    it('should throw NotFoundException if user does not exist', async () => {
      // Simula uma resposta onde o item não foi encontrado (sem atributos retornados)
      ddbMock.on(UpdateCommand).resolves({ Attributes: undefined });

      // Esperamos que a chamada ao método `update` rejeite com um NotFoundException
      await expect(service.update(userId, contactDto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
import { Test, TestingModule } from '@nestjs/testing';
import { SymptomsService } from './symptoms.service';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { BadRequestException } from '@nestjs/common';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('SymptomsService', () => {
  let service: SymptomsService;

  beforeEach(async () => {
    ddbMock.reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SymptomsService,
        {
          provide: 'DYNAMO_CLIENT',
          useValue: ddbMock,
        },
      ],
    }).compile();

    service = module.get<SymptomsService>(SymptomsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addSymptom', () => {
    it('should add a symptom successfully', async () => {
      const symptomData = {
        profile_id: 'paciente-123',
        description: 'Dor de cabeça',
      };

      const result = await service.addSymptom(symptomData);

      expect(result.message).toBe('Sintoma registrado com sucesso');
      expect(result.symptom.profile_id).toBe(symptomData.profile_id);
      expect(result.symptom.description).toBe(symptomData.description);
      expect(result.symptom).toHaveProperty('symptom_id');
      expect(result.symptom).toHaveProperty('created_at');

      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'CANDISymptoms',
        Item: result.symptom,
      });
    });

    it('should throw BadRequestException if profile_id is missing', async () => {
        expect.assertions(1);
        try {
            await service.addSymptom({ profile_id: '', description: 'Nausea' });
        } catch (e) {
            expect(e).toBeInstanceOf(BadRequestException);
        }
    });
  });

  describe('listSymptomsByProfile', () => {
    it('should return a list of symptoms for a given profile_id', async () => {
        const profileId = 'paciente-456';
        const mockSymptoms = [
            { symptom_id: 'uuid-1', profile_id: profileId, description: 'Fadiga', created_at: new Date().toISOString() },
            { symptom_id: 'uuid-2', profile_id: profileId, description: 'Tontura', created_at: new Date().toISOString() },
        ];

        ddbMock.on(QueryCommand).resolves({ Items: mockSymptoms });

        const result = await service.listSymptomsByProfile(profileId);

        expect(result).toEqual(mockSymptoms);

        expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
            TableName: 'CANDISymptoms',
            KeyConditionExpression: 'profile_id = :pid',
            ExpressionAttributeValues: { ':pid': profileId },
        });
    });

    it('should return an empty array if no symptoms are found', async () => {
        const profileId = 'paciente-789';

        ddbMock.on(QueryCommand).resolves({ Items: [] });

        const result = await service.listSymptomsByProfile(profileId);

        expect(result).toEqual([]);
    });
  });
});
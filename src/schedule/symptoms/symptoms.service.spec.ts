import { Test, TestingModule } from '@nestjs/testing';
import { SymptomsService } from './symptoms.service';
import { AuthService } from '../../auth/auth.service'; 
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { BadRequestException } from '@nestjs/common';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);

const mockAuthService = {
  findProfileByEmail: jest.fn(),
};

describe('SymptomsService', () => {
  let service: SymptomsService;

  beforeEach(async () => {
    ddbMock.reset();
    mockAuthService.findProfileByEmail.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SymptomsService,
        {
          provide: 'DYNAMO_CLIENT',
          useValue: ddbMock,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    service = module.get<SymptomsService>(SymptomsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addSymptom', () => {
    const symptomData = {
      email: 'paciente.real@email.com',
      description: 'Dor de cabeça',
    };
    
    const mockProfile = {
      profile_id: 'pid-12345',
      profile_email: 'paciente.real@email.com',
      profile_name: 'Paciente Teste',
    };

    it('should find profile by email and add a symptom successfully', async () => {
      mockAuthService.findProfileByEmail.mockResolvedValue(mockProfile);

      const result = await service.addSymptom(symptomData);

      expect(mockAuthService.findProfileByEmail).toHaveBeenCalledWith(symptomData.email);
      
      expect(result.message).toBe('Sintoma registrado com sucesso');
      expect(result.symptom.profile_id).toBe(mockProfile.profile_id); 
      expect(result.symptom.email).toBe(symptomData.email);

      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'CANDISymptoms',
        Item: expect.objectContaining({
          profile_id: mockProfile.profile_id,
          email: symptomData.email,
        }),
      });
    });

    it('should throw an error if profile is not found', async () => {
      const errorMessage = 'Usuário com este e-mail não foi encontrado';
      mockAuthService.findProfileByEmail.mockRejectedValue(new BadRequestException(errorMessage));

      await expect(service.addSymptom(symptomData)).rejects.toThrow(errorMessage);
    });
  });

  describe('listSymptomsByEmail', () => {
    it('should return a list of symptoms for a given email', async () => {
      const email = 'paciente.lista@email.com';
      const mockSymptoms = [{ email, description: 'Fadiga' }];
      ddbMock.on(QueryCommand).resolves({ Items: mockSymptoms });

      const result = await service.listSymptomsByEmail(email);

      expect(result).toEqual(mockSymptoms);
      expect(ddbMock).toHaveReceivedCommandWith(QueryCommand, {
        TableName: 'CANDISymptoms',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
      });
    });
  });
});
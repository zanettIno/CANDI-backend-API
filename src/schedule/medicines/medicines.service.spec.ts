import { Test, TestingModule } from '@nestjs/testing';
import { MedicinesService } from './medicines.service';
import { AuthService } from '../../auth/auth.service';
import { DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { BadRequestException } from '@nestjs/common';
import { mockClient } from 'aws-sdk-client-mock';
import 'aws-sdk-client-mock-jest';

// 1. Mock do cliente DynamoDB (igual ao teste de symptoms)
const ddbMock = mockClient(DynamoDBDocumentClient);

// 2. Mock do AuthService (igual ao teste de symptoms)
const mockAuthService = {
  findProfileByEmail: jest.fn(),
};

describe('MedicinesService', () => {
  let service: MedicinesService;

  beforeEach(async () => {
    ddbMock.reset();
    mockAuthService.findProfileByEmail.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MedicinesService,
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

    service = module.get<MedicinesService>(MedicinesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const medicinePayload = {
      email: 'paciente.real@email.com',
      medicine_name: 'Dipirona',
      medicine_dosage: '500mg',
      medicine_period: 'Se sentir dor',
      medicine_posology: '1 comprimido',
    };
    
    const mockProfile = {
      profile_id: 'pid-abcde',
      profile_email: 'paciente.real@email.com',
      profile_name: 'Paciente Mock',
    };

    it('should find profile by email and add a medicine successfully', async () => {
      // Simulamos que o AuthService encontrou o usuário
      mockAuthService.findProfileByEmail.mockResolvedValue(mockProfile);

      const result = await service.create(medicinePayload);

      // Verificamos se o AuthService foi chamado
      expect(mockAuthService.findProfileByEmail).toHaveBeenCalledWith(medicinePayload.email);
      
      // Verificamos a mensagem de sucesso
      expect(result.message).toBe('Medicamento registado com sucesso');
      // Verificamos se o profile_id correto foi adicionado ao objeto
      expect(result.medicine.profile_id).toBe(mockProfile.profile_id);

      // Verificamos se o comando Put foi enviado ao DynamoDB com os dados corretos
      expect(ddbMock).toHaveReceivedCommandWith(PutCommand, {
        TableName: 'CANDIMedicines',
        Item: expect.objectContaining({
          profile_id: mockProfile.profile_id,
          email: medicinePayload.email,
          medicine_name: 'Dipirona',
        }),
      });
    });

    it('should throw an error if profile is not found', async () => {
      // Simulamos que o AuthService NÃO encontrou o usuário
      const errorMessage = 'Usuário não encontrado';
      mockAuthService.findProfileByEmail.mockRejectedValue(new BadRequestException(errorMessage));

      // Verificamos se o nosso serviço lança o erro corretamente
      await expect(service.create(medicinePayload)).rejects.toThrow(errorMessage);
    });
  });

  describe('findAllByEmail', () => {
    const email = 'paciente.lista@email.com';
    const mockProfile = { profile_id: 'pid-lista', profile_email: email };

    it('should return a sorted list of medicines for a given email', async () => {
      const mockMedicines = [
        { created_at: '2025-01-01T10:00:00Z', medicine_name: 'Mais antigo' },
        { created_at: '2025-01-01T12:00:00Z', medicine_name: 'Mais novo' },
      ];
      
      // Simulamos que o AuthService e o DynamoDB funcionam
      mockAuthService.findProfileByEmail.mockResolvedValue(mockProfile);
      ddbMock.on(QueryCommand).resolves({ Items: mockMedicines });

      const result = await service.findAllByEmail(email);

      // Verificamos se o AuthService foi chamado para validar o usuário
      expect(mockAuthService.findProfileByEmail).toHaveBeenCalledWith(email);
      // Verificamos se o primeiro item da lista é o mais novo (por causa da ordenação)
      expect(result[0].medicine_name).toBe('Mais novo');
    });

    it('should throw an error if the user is not found', async () => {
      // Simulamos que o AuthService não encontrou o usuário
      mockAuthService.findProfileByEmail.mockRejectedValue(new BadRequestException('Usuário não encontrado'));

      // Verificamos se o nosso serviço lança o erro
      await expect(service.findAllByEmail(email)).rejects.toThrow('Usuário não encontrado');
    });
  });
});
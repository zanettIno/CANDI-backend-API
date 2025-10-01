import { Test, TestingModule } from '@nestjs/testing';
import { SymptomsController } from './symptoms.controller';
import { SymptomsService } from './symptoms.service';

const mockSymptomsService = {
  addSymptom: jest.fn(),
  listSymptomsByEmail: jest.fn(),
};

describe('SymptomsController', () => {
  let controller: SymptomsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SymptomsController],
      providers: [
        {
          provide: SymptomsService,
          useValue: mockSymptomsService,
        },
      ],
    }).compile();

    controller = module.get<SymptomsController>(SymptomsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should call addSymptom from service', async () => {
      const dto = { email: 'paciente@teste.com', description: 'Nausea' };
      const expectedResult = { message: 'Success', symptom: { ...dto, symptom_id: 'uuid', created_at: 'date', profile_id: 'pid-123' } };
      
      mockSymptomsService.addSymptom.mockResolvedValue(expectedResult);

      const result = await controller.create(dto);

      expect(mockSymptomsService.addSymptom).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    it('should call listSymptomsByEmail from service', async () => {
        const email = 'paciente@teste.com';
        const expectedSymptoms = [{ description: 'Fadiga' }];

        mockSymptomsService.listSymptomsByEmail.mockResolvedValue(expectedSymptoms);

        const result = await controller.findAll(email);
        
        expect(mockSymptomsService.listSymptomsByEmail).toHaveBeenCalledWith(email);
        expect(result).toEqual(expectedSymptoms);
    });
  });
});
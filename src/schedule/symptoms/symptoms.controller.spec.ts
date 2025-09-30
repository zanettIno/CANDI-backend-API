import { Test, TestingModule } from '@nestjs/testing';
import { SymptomsController } from './symptoms.controller';
import { SymptomsService } from './symptoms.service';

const mockSymptomsService = {
  addSymptom: jest.fn(),
  listSymptomsByProfile: jest.fn(),
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
      const dto = { profile_id: 'paciente-123', description: 'Nausea' };
      const expectedResult = { message: 'Success', symptom: { ...dto, symptom_id: 'uuid', created_at: 'date' } };
      
      mockSymptomsService.addSymptom.mockResolvedValue(expectedResult);

      const result = await controller.create(dto);

      expect(mockSymptomsService.addSymptom).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('findAll', () => {
    it('should call listSymptomsByProfile from service', async () => {
        const profileId = 'paciente-456';
        const expectedSymptoms = [{ description: 'Fadiga' }];

        mockSymptomsService.listSymptomsByProfile.mockResolvedValue(expectedSymptoms);

        const result = await controller.findAll(profileId);
        
        expect(mockSymptomsService.listSymptomsByProfile).toHaveBeenCalledWith(profileId);
        expect(result).toEqual(expectedSymptoms);
    });
  });
});
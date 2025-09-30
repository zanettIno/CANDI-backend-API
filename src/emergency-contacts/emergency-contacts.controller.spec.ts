import { Test, TestingModule } from '@nestjs/testing';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsService } from './emergency-contacts.service';
import { UpdateEmergencyContactsDto } from './dto/update-emergency-contacts.dto';

const mockService = {
  update: jest.fn(),
};

describe('EmergencyContactsController', () => {
  let controller: EmergencyContactsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmergencyContactsController],
      providers: [
        {
          provide: EmergencyContactsService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<EmergencyContactsController>(
      EmergencyContactsController,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('update', () => {
    it('should call the service with the correct parameters', async () => {
      const userId = 'user-123';
      const contactDto: UpdateEmergencyContactsDto = {
        emergency_contact_name: 'Maria Silva',
        emergency_contact_phone: '11999998888',
        emergency_contact_relationship: 'Mãe',
      };

      const expectedResult = { message: 'Success' };
      mockService.update.mockResolvedValue(expectedResult);

      const result = await controller.update(userId, contactDto);

      // Verifica se o método do serviço foi chamado com o ID e o DTO
      expect(mockService.update).toHaveBeenCalledWith(userId, contactDto);
      // Verifica se o controller retornou o resultado do serviço
      expect(result).toEqual(expectedResult);
    });
  });
});
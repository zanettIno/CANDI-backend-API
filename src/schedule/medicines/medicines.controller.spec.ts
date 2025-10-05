import { Test, TestingModule } from '@nestjs/testing';
import { MedicinesController } from './medicines.controller';
import { MedicinesService } from './medicines.service';

// 1. Criamos um "dublê" do nosso serviço com funções falsas (jest.fn())
const mockMedicinesService = {
  create: jest.fn(),
  findAllByEmail: jest.fn(),
};

describe('MedicinesController', () => {
  let controller: MedicinesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicinesController],
      providers: [
        {
          provide: MedicinesService,
          useValue: mockMedicinesService, // 2. Usamos o nosso dublê em vez do serviço real
        },
      ],
    }).compile();

    controller = module.get<MedicinesController>(MedicinesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Testes para a rota POST /
  describe('create', () => {
    it('should call the create method from the service with the correct payload', async () => {
      const payload = {
        email: 'teste@paciente.com',
        medicine_name: 'Ibuprofeno',
        medicine_dosage: '600mg',
        medicine_period: 'A cada 12 horas',
        medicine_posology: '1 comprimido',
      };

      // Simulamos que a chamada ao serviço foi bem-sucedida
      mockMedicinesService.create.mockResolvedValue({ message: 'Sucesso' });

      await controller.create(payload);

      // Verificamos se o método 'create' do serviço foi chamado com os dados corretos
      expect(mockMedicinesService.create).toHaveBeenCalledWith(payload);
    });
  });

  // Testes para a rota GET /:email
  describe('findAllByEmail', () => {
    it('should call the findAllByEmail method from the service with the correct email', async () => {
      const email = 'teste@paciente.com';
      const expectedMedicines = [{ medicine_name: 'Ibuprofeno' }];

      // Simulamos que o serviço retornou uma lista de medicamentos
      mockMedicinesService.findAllByEmail.mockResolvedValue(expectedMedicines);

      const result = await controller.findAllByEmail(email);

      // Verificamos se o método 'findAllByEmail' do serviço foi chamado com o e-mail correto
      expect(mockMedicinesService.findAllByEmail).toHaveBeenCalledWith(email);
      // Verificamos se o controller retornou o que o serviço lhe deu
      expect(result).toEqual(expectedMedicines);
    });
  });
});
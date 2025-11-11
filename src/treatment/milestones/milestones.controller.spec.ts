import { Test, TestingModule } from '@nestjs/testing';
import { MilestonesController } from './milestones.controller';
import { MilestonesService } from './milestones.service';

describe('MilestonesController', () => {
  let controller: MilestonesController;
  let service: MilestonesService;

  const mockService = {
    createMilestone: jest.fn(),
    listMilestones: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MilestonesController],
      providers: [{ provide: MilestonesService, useValue: mockService }],
    }).compile();

    controller = module.get<MilestonesController>(MilestonesController);
    service = module.get<MilestonesService>(MilestonesService);
  });

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  it('deve criar um marco chamando o service', async () => {
    mockService.createMilestone.mockResolvedValue({ message: 'Marco criado com sucesso' });
    const result = await controller.createMilestone('123', { title: 'Teste' });
    expect(result.message).toBe('Marco criado com sucesso');
  });

  it('deve listar marcos chamando o service', async () => {
    mockService.listMilestones.mockResolvedValue({ milestones: [] });
    const result = await controller.listMilestones('123');
    expect(result.milestones).toBeDefined();
  });
});

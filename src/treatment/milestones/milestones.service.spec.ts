import { Test, TestingModule } from '@nestjs/testing';
import { MilestonesService } from './milestones.service';

const mockDynamoClient = {
  send: jest.fn(),
};

describe('MilestonesService', () => {
  let service: MilestonesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MilestonesService,
        { provide: 'DYNAMO_CLIENT', useValue: mockDynamoClient },
      ],
    }).compile();

    service = module.get<MilestonesService>(MilestonesService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('deve criar um marco com sucesso', async () => {
    mockDynamoClient.send.mockResolvedValueOnce({});
    const result = await service.createMilestone('123', { title: 'Primeira quimio' });
    expect(result.message).toBe('Marco criado com sucesso');
    expect(result.milestone.profile_id).toBe('123');
  });

  it('deve listar marcos usando QueryCommand', async () => {
    mockDynamoClient.send.mockResolvedValueOnce({
      Items: [{ title: 'Primeira quimio', type: 'fixed' }],
    });
    const result = await service.listMilestones('123');
    expect(result.milestones).toHaveLength(1);
  });

  it('deve fazer fallback para ScanCommand se Query falhar', async () => {
    mockDynamoClient.send
      .mockRejectedValueOnce(new Error('Query failed'))
      .mockResolvedValueOnce({
        Items: [{ title: 'Fallback Scan', type: 'custom' }],
      });

    const result = await service.listMilestones('123');
    expect(result.milestones[0].title).toBe('Fallback Scan');
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { CalendarService } from './calendar.service';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

describe('CalendarService', () => {
  let service: CalendarService;
  const ddbMock = mockClient(DynamoDBDocumentClient);

  beforeEach(async () => {
    ddbMock.reset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CalendarService,
        {
          provide: 'DYNAMO_CLIENT',
          useValue: ddbMock,
        },
      ],
    }).compile();

    service = module.get<CalendarService>(CalendarService);
  });

  it('deve ser definido', () => {
    expect(service).toBeDefined();
  });

  it('deve criar um evento com sucesso', async () => {
    ddbMock.on(PutCommand).resolves({});

    const result = await service.createEvent('abc', {
      appointment_name: 'Consulta',
      appointment_date: '2025-10-20',
      appointment_time: '15:00',
    });

    expect(result.message).toBe('Compromisso criado com sucesso');
    expect(result.event.appointment_name).toBe('Consulta');
  });

  it('deve listar eventos via QueryCommand', async () => {
    const mockItems = [
      { appointment_name: 'Consulta', appointment_date: '2025-10-20', appointment_time: '15:00' },
    ];

    ddbMock.on(QueryCommand).resolves({ Items: mockItems });

    const result = await service.listEvents('abc');
    expect(result.length).toBe(1);
    expect(result[0].appointment_name).toBe('Consulta');
  });

  it('deve usar fallback ScanCommand se Query falhar', async () => {
    ddbMock.on(QueryCommand).rejects(new Error('Index not ready'));
    ddbMock.on(ScanCommand).resolves({
      Items: [{ appointment_name: 'Backup' }],
    });

    const result = await service.listEvents('abc');
    expect(result[0].appointment_name).toBe('Backup');
  });

  it('deve gerar um resumo mensal correto', async () => {
    jest.spyOn(service, 'listEvents').mockResolvedValue([
      { appointment_date: '2025-10-20' },
      { appointment_date: '2025-10-20' },
      { appointment_date: '2025-10-25' },
    ]);

    const summary = await service.getMonthlySummary('abc');

    expect(summary['2025-10-20'].events).toBe(2);
    expect(summary['2025-10-25'].events).toBe(1);
  });
});

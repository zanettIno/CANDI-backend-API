import { Test, TestingModule } from '@nestjs/testing';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

describe('CalendarController', () => {
  let controller: CalendarController;
  let service: CalendarService;

  const mockCalendarService = {
    createEvent: jest.fn(),
    listEvents: jest.fn(),
    getMonthlySummary: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CalendarController],
      providers: [
        {
          provide: CalendarService,
          useValue: mockCalendarService,
        },
      ],
    }).compile();

    controller = module.get<CalendarController>(CalendarController);
    service = module.get<CalendarService>(CalendarService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('deve ser definido', () => {
    expect(controller).toBeDefined();
  });

  it('deve criar um evento chamando o service.createEvent', async () => {
    const mockEvent = {
      appointment_name: 'Consulta',
      appointment_date: '2025-10-20',
      appointment_time: '14:00',
    };
    const mockResponse = { message: 'ok' };

    mockCalendarService.createEvent.mockResolvedValue(mockResponse);

    const result = await controller.createEvent('123', mockEvent);
    expect(result).toEqual(mockResponse);
    expect(service.createEvent).toHaveBeenCalledWith('123', mockEvent);
  });

  it('deve listar eventos chamando o service.listEvents', async () => {
    const mockList = [{ appointment_name: 'Exame' }];
    mockCalendarService.listEvents.mockResolvedValue(mockList);

    const result = await controller.listEvents('123');
    expect(result).toEqual(mockList);
    expect(service.listEvents).toHaveBeenCalledWith('123');
  });

  it('deve obter o resumo mensal chamando o service.getMonthlySummary', async () => {
    const mockSummary = { '2025-10-20': { marked: true } };
    mockCalendarService.getMonthlySummary.mockResolvedValue(mockSummary);

    const result = await controller.getSummary('123');
    expect(result).toEqual(mockSummary);
    expect(service.getMonthlySummary).toHaveBeenCalledWith('123');
  });
});

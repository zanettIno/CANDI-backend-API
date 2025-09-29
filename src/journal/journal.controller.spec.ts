import { Test, TestingModule } from '@nestjs/testing';
import { JournalController } from './journal.controller';

describe('JournalController', () => {
  let controller: JournalController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JournalController],
    }).compile();

    controller = module.get<JournalController>(JournalController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});

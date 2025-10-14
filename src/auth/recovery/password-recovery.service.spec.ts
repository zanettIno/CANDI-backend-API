import { Test, TestingModule } from '@nestjs/testing';
import { PasswordRecoveryService } from './password-recovery.service';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

describe('PasswordRecoveryService', () => {
  let service: PasswordRecoveryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordRecoveryService,
        { provide: DynamoDBDocumentClient, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = module.get<PasswordRecoveryService>(PasswordRecoveryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});

import { Module } from '@nestjs/common';
import { SymptomsController } from './symptoms.controller';
import { SymptomsService } from './symptoms.service';

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

@Module({
  controllers: [SymptomsController],
  providers: [
    SymptomsService,
    {
      provide: 'DYNAMO_CLIENT', 
      useFactory: () => {
        const client = new DynamoDBClient({
          region: process.env.AWS_REGION || 'us-east-1',
        });
        
        return DynamoDBDocumentClient.from(client);
      },
    },
  ],
})
export class SymptomsModule {}
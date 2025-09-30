import { Module } from '@nestjs/common';
import { EmergencyContactsController } from './emergency-contacts.controller';
import { EmergencyContactsService } from './emergency-contacts.service';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

@Module({
  controllers: [EmergencyContactsController],
  providers: [
    EmergencyContactsService,
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
export class EmergencyContactsModule {}
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

@Module({
  providers: [
    {
      provide: 'DYNAMO_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const client = new DynamoDBClient({
          region: config.get<string>('AWS_REGION')!,
          credentials: {
            accessKeyId: config.get<string>('AWS_ACCESS_KEY_ID')!,
            secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY')!,
          },
        });
        return DynamoDBDocumentClient.from(client);
      },
    },
  ],
  exports: ['DYNAMO_CLIENT'],
})
export class DynamoDBModule {}

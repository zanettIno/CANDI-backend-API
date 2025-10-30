import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommunityController } from './community.controller';
import { CommunityGateway } from './community.gateway';
import { CommunityService } from './community.service';
import { Community, CommunitySchema } from './schemas/community.schema';
import { Message, MessageSchema } from './schemas/message.schema';
import { AuthModule } from '../auth/auth.module';
import { DynamoDBModule } from '../dynamodb/dynamodb.module'; 

@Module({
  imports: [DynamoDBModule,
    MongooseModule.forFeature([
      { name: Community.name, schema: CommunitySchema },
      { name: Message.name, schema: MessageSchema },
    ]),
    AuthModule, // ✅ isso garante que o JwtService e AuthGuard fiquem disponíveis
  ],
  controllers: [CommunityController],
  providers: [CommunityService, CommunityGateway],
})
export class CommunityModule {}

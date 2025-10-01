import { Module } from '@nestjs/common';
import { MedicinesController } from './medicines.controller';
import { MedicinesService } from './medicines.service';
import { AuthModule } from '../../auth/auth.module';
import { DynamoDBModule } from '../../dynamodb/dynamodb.module'; 

@Module({
  imports: [AuthModule, DynamoDBModule], 
  controllers: [MedicinesController],
  providers: [MedicinesService],
})
export class MedicinesModule {}
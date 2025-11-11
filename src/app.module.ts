import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose'; // ✅ import do mongoose

import { DynamoDBModule } from './dynamodb/dynamodb.module';
import { AuthModule } from './auth/auth.module';
import { SymptomsModule } from './schedule/symptoms/symptoms.module';
import { EmergencyContactsModule } from './emergency-contacts/emergency-contacts.module';
import { JournalModule } from './journal/journal.module';
import { MedicinesModule } from './schedule/medicines/medicines.module';
import { CalendarModule } from './schedule/calendar/calendar.module';
import { ProfileImageModule } from './s3/profile-image.module';
import { RecuperarModule } from './auth/recovery/recovery.module';
import { DiaryModule } from './diary/diary.module';
import { CommunityModule } from './community/community.module';
// import { FeedModule } from './feed/feed.module.ts'; // 🔹 NOVO
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDBModule,
    MongooseModule.forRoot(process.env.MONGO_URI || '', {
      dbName: 'candi_communities', // ✅ nome do banco separado
    }),
    AuthModule,
    SymptomsModule,
    EmergencyContactsModule,
    JournalModule,
    MedicinesModule,
    CalendarModule,
    ProfileImageModule,
    RecuperarModule,
    // FeedModule, 
    ChatModule,
  ],
})
export class AppModule {}

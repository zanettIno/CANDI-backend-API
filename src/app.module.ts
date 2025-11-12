// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { ChatModule } from './chat/chat.module'; // Módulo do Chat
import { FeedModule } from './feed/feed.module'; // 🔹 NOVO MÓDULO DO FEED

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DynamoDBModule,
    AuthModule,
    SymptomsModule,
    EmergencyContactsModule,
    JournalModule,
    MedicinesModule,
    CalendarModule,
    ProfileImageModule,
    RecuperarModule,
    DiaryModule,
    ChatModule,
    FeedModule, // 🔹 ADICIONADO AQUI
  ],
})
export class AppModule {}
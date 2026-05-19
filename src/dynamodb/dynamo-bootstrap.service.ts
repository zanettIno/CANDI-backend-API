import { Injectable, OnModuleInit, Inject, Logger } from '@nestjs/common';
import {
  DynamoDBClient,
  CreateTableCommand,
  CreateTableCommandInput,
} from '@aws-sdk/client-dynamodb';

const PAY_PER_REQUEST = { BillingMode: 'PAY_PER_REQUEST' as const };

const TABLES: CreateTableCommandInput[] = [
  // ─── Auth ────────────────────────────────────────────────────────────────
  {
    TableName: 'CANDIProfile',
    KeySchema: [{ AttributeName: 'profile_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'profile_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Chat ────────────────────────────────────────────────────────────────
  {
    TableName: 'CANDIMessages',
    KeySchema: [
      { AttributeName: 'conversation_id', KeyType: 'HASH' },
      { AttributeName: 'timestamp', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'conversation_id', AttributeType: 'S' },
      { AttributeName: 'timestamp', AttributeType: 'S' },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDIUserConversations',
    KeySchema: [
      { AttributeName: 'profile_id', KeyType: 'HASH' },
      { AttributeName: 'conversation_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'profile_id', AttributeType: 'S' },
      { AttributeName: 'conversation_id', AttributeType: 'S' },
      { AttributeName: 'last_message_timestamp', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'InboxSortGSI',
        KeySchema: [
          { AttributeName: 'profile_id', KeyType: 'HASH' },
          { AttributeName: 'last_message_timestamp', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Moderação / Reports ─────────────────────────────────────────────────
  {
    TableName: 'CANDIReports',
    KeySchema: [
      { AttributeName: 'post_id', KeyType: 'HASH' },
      { AttributeName: 'reporter_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'post_id', AttributeType: 'S' },
      { AttributeName: 'reporter_id', AttributeType: 'S' },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Rede de Apoio ───────────────────────────────────────────────────────
  {
    TableName: 'CANDIInvites',
    KeySchema: [{ AttributeName: 'invite_token', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'invite_token', AttributeType: 'S' },
      { AttributeName: 'patient_id', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ByPatientGSI',
        KeySchema: [{ AttributeName: 'patient_id', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDISupportLinks',
    KeySchema: [
      { AttributeName: 'patient_id', KeyType: 'HASH' },
      { AttributeName: 'support_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'patient_id', AttributeType: 'S' },
      { AttributeName: 'support_id', AttributeType: 'S' },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Feed / Community ────────────────────────────────────────────────────
  {
    TableName: 'CANDIPosts',
    KeySchema: [
      { AttributeName: 'profile_id', KeyType: 'HASH' },
      { AttributeName: 'post_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'profile_id', AttributeType: 'S' },
      { AttributeName: 'post_id', AttributeType: 'S' },
      { AttributeName: 'topic', AttributeType: 'S' },
      { AttributeName: 'created_at', AttributeType: 'S' },
      { AttributeName: 'subgroup', AttributeType: 'S' },
      { AttributeName: 'feed_partition', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ByTopicGSI',
        KeySchema: [
          { AttributeName: 'topic', KeyType: 'HASH' },
          { AttributeName: 'created_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'BySubgroupGSI',
        KeySchema: [
          { AttributeName: 'subgroup', KeyType: 'HASH' },
          { AttributeName: 'created_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'AllPostsGSI',
        KeySchema: [
          { AttributeName: 'feed_partition', KeyType: 'HASH' },
          { AttributeName: 'created_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDIGroups',
    KeySchema: [{ AttributeName: 'group_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'group_id', AttributeType: 'S' },
      { AttributeName: 'topic', AttributeType: 'S' },
      { AttributeName: 'created_at', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ByTopicGSI',
        KeySchema: [
          { AttributeName: 'topic', KeyType: 'HASH' },
          { AttributeName: 'created_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDIGroupMembers',
    KeySchema: [
      { AttributeName: 'group_id', KeyType: 'HASH' },
      { AttributeName: 'profile_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'group_id', AttributeType: 'S' },
      { AttributeName: 'profile_id', AttributeType: 'S' },
      { AttributeName: 'joined_at', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ByProfileGSI',
        KeySchema: [
          { AttributeName: 'profile_id', KeyType: 'HASH' },
          { AttributeName: 'joined_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDIPostLikes',
    KeySchema: [
      { AttributeName: 'post_id', KeyType: 'HASH' },
      { AttributeName: 'profile_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'post_id', AttributeType: 'S' },
      { AttributeName: 'profile_id', AttributeType: 'S' },
      { AttributeName: 'liked_at', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ByProfileGSI',
        KeySchema: [
          { AttributeName: 'profile_id', KeyType: 'HASH' },
          { AttributeName: 'liked_at', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDIPostFavorites',
    KeySchema: [
      { AttributeName: 'profile_id', KeyType: 'HASH' },
      { AttributeName: 'post_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'profile_id', AttributeType: 'S' },
      { AttributeName: 'post_id', AttributeType: 'S' },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDIComments',
    KeySchema: [
      { AttributeName: 'post_id', KeyType: 'HASH' },
      { AttributeName: 'comment_id', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'post_id', AttributeType: 'S' },
      { AttributeName: 'comment_id', AttributeType: 'S' },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Schedule ────────────────────────────────────────────────────────────
  {
    TableName: 'CANDIMedicines',
    KeySchema: [{ AttributeName: 'medicine_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'medicine_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDIAppointment',
    KeySchema: [{ AttributeName: 'appointment_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'appointment_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
  {
    TableName: 'CANDISymptoms',
    KeySchema: [{ AttributeName: 'symptoms_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'symptoms_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Journal ─────────────────────────────────────────────────────────────
  {
    TableName: 'CANDIFeelings',
    KeySchema: [{ AttributeName: 'feeling_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'feeling_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Emergency Contacts ──────────────────────────────────────────────────
  {
    TableName: 'CANDIEmergencyContacts',
    KeySchema: [{ AttributeName: 'emergency_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'emergency_id', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'EmailIndex',
        KeySchema: [{ AttributeName: 'email', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },

  // ─── Treatment ───────────────────────────────────────────────────────────
  {
    TableName: 'CANDITreatmentMilestones',
    KeySchema: [{ AttributeName: 'milestone_id', KeyType: 'HASH' }],
    AttributeDefinitions: [
      { AttributeName: 'milestone_id', AttributeType: 'S' },
      { AttributeName: 'profile_id', AttributeType: 'S' },
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'ProfileMilestonesIndex',
        KeySchema: [{ AttributeName: 'profile_id', KeyType: 'HASH' }],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    ...PAY_PER_REQUEST,
  },
];

@Injectable()
export class DynamoBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DynamoBootstrapService.name);

  constructor(@Inject('DYNAMO_RAW_CLIENT') private readonly client: DynamoDBClient) {}

  async onModuleInit() {
    await this.ensureTables();
  }

  private async ensureTables() {
    const results = await Promise.allSettled(
      TABLES.map(def => this.client.send(new CreateTableCommand(def))),
    );

    results.forEach((result, i) => {
      const name = TABLES[i].TableName;
      if (result.status === 'fulfilled') {
        this.logger.log(`✅ Tabela criada: ${name}`);
      } else {
        const err = result.reason as any;
        if (err?.name === 'ResourceInUseException') {
          this.logger.debug(`   ${name} já existe`);
        } else {
          this.logger.error(`❌ Erro ao criar ${name}: ${err?.message}`);
        }
      }
    });
  }
}

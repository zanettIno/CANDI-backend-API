/**
 * Script para criar conta admin no DynamoDB.
 * Execute: npx ts-node src/admin/seed-admin.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import * as dotenv from 'dotenv';
dotenv.config();

const client = new DynamoDBClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});
const db = DynamoDBDocumentClient.from(client);
const TABLE = process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile';

async function seed() {
  const adminEmail = 'mateus.veloso@timeware.com.br';
  const adminPassword = 'CANDI@admin2026';
  const adminName = 'Admin CANDI';

  // Verifica se já existe
  const existing = await db.send(new ScanCommand({
    TableName: TABLE,
    FilterExpression: 'profile_email = :email',
    ExpressionAttributeValues: { ':email': adminEmail },
  }));

  if (existing.Items?.length) {
    console.log(`✅ Conta admin já existe: ${adminEmail}`);
    return;
  }

  const hash = await bcrypt.hash(adminPassword, 10);
  await db.send(new PutCommand({
    TableName: TABLE,
    Item: {
      profile_id: randomUUID(),
      profile_name: adminName,
      profile_nickname: 'Admin',
      profile_email: adminEmail,
      profile_password: hash,
      role: 'admin',
      profile_status: 'active',
      created_at: new Date().toISOString(),
    },
  }));

  console.log('✅ Conta admin criada!');
  console.log(`   Email: ${adminEmail}`);
  console.log(`   Senha: ${adminPassword}`);
}

seed().catch(console.error);

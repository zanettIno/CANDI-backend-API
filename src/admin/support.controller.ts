/**
 * Endpoints de acesso para rede de apoio.
 * Suporte só pode LER dados do paciente vinculado, conforme permissões.
 */
import { Controller, Get, Param, UseGuards, Req, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { DynamoDBDocumentClient, QueryCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { Inject } from '@nestjs/common';
import { DiaryService } from '../diary/diary.service';

interface AuthReq { user: { profile_id: string; role: string } }

@Controller('support')
@UseGuards(AuthGuard)
export class SupportController {
  constructor(
    @Inject('DYNAMO_CLIENT') private readonly db: DynamoDBDocumentClient,
    private readonly diaryService: DiaryService,
  ) {}

  private async checkLink(supportId: string, patientId: string, permission: string) {
    const link = await this.db.send(new GetCommand({
      TableName: 'CANDISupportLinks',
      Key: { patient_id: patientId, support_id: supportId },
    }));
    if (!link.Item || link.Item.status !== 'active')
      throw new ForbiddenException('Sem vínculo ativo com este paciente');
    if (permission && !link.Item.permissions?.includes(permission))
      throw new ForbiddenException(`Sem permissão para ver ${permission}`);
    return link.Item;
  }

  // ── Pacientes vinculados ──────────────────────────────────────────────────
  @Get('my-patients')
  async getMyPatients(@Req() req: AuthReq) {
    try {
      const r = await this.db.send(new QueryCommand({
        TableName: 'CANDISupportLinks',
        IndexName: 'BySupportGSI',
        KeyConditionExpression: 'support_id = :sid',
        FilterExpression: '#s = :active',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':sid': req.user.profile_id, ':active': 'active' },
      }));
      return r.Items || [];
    } catch {
      const r = await this.db.send(new ScanCommand({
        TableName: 'CANDISupportLinks',
        FilterExpression: 'support_id = :sid AND #s = :active',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':sid': req.user.profile_id, ':active': 'active' },
      }));
      return r.Items || [];
    }
  }

  // ── Agenda do paciente ─────────────────────────────────────────────────────
  @Get('patient/:patientId/agenda')
  async getPatientAgenda(@Req() req: AuthReq, @Param('patientId') patientId: string) {
    await this.checkLink(req.user.profile_id, patientId, 'agenda');

    const profile = await this.db.send(new GetCommand({
      TableName: process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile',
      Key: { profile_id: patientId },
    }));
    if (!profile.Item) throw new NotFoundException('Paciente não encontrado');

    const email = profile.Item.profile_email;
    const [appointments, medicines] = await Promise.all([
      this.db.send(new QueryCommand({
        TableName: 'CANDIAppointment',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      })),
      this.db.send(new QueryCommand({
        TableName: 'CANDIMedicines',
        IndexName: 'EmailIndex',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email },
      })),
    ]);
    return {
      appointments: appointments.Items || [],
      medicines: medicines.Items || [],
    };
  }

  // ── Marcos do paciente ────────────────────────────────────────────────────
  @Get('patient/:patientId/milestones')
  async getPatientMilestones(@Req() req: AuthReq, @Param('patientId') patientId: string) {
    await this.checkLink(req.user.profile_id, patientId, 'milestones');
    const result = await this.db.send(new QueryCommand({
      TableName: 'CANDITreatmentMilestones',
      IndexName: 'ProfileMilestonesIndex',
      KeyConditionExpression: 'profile_id = :pid',
      ExpressionAttributeValues: { ':pid': patientId },
      ScanIndexForward: false,
    }));
    return result.Items || [];
  }

  // ── Diário do paciente (só leitura via S3) ─────────────────────────────────
  @Get('patient/:patientId/diary')
  async getPatientDiary(@Req() req: AuthReq, @Param('patientId') patientId: string) {
    await this.checkLink(req.user.profile_id, patientId, 'diary_read');
    // Reutiliza DiaryService.listDiaries que lê os arquivos do S3
    const entries = await this.diaryService.listDiaries(patientId);
    return entries;
  }

  // ── Perfil básico do paciente ──────────────────────────────────────────────
  @Get('patient/:patientId/profile')
  async getPatientProfile(@Req() req: AuthReq, @Param('patientId') patientId: string) {
    // Qualquer suporte vinculado pode ver o perfil básico
    const link = await this.db.send(new GetCommand({
      TableName: 'CANDISupportLinks',
      Key: { patient_id: patientId, support_id: req.user.profile_id },
    }));
    if (!link.Item) throw new ForbiddenException('Sem vínculo com este paciente');

    const profile = await this.db.send(new GetCommand({
      TableName: process.env.DYNAMO_TABLE_PROFILE || 'CANDIProfile',
      Key: { profile_id: patientId },
    }));
    if (!profile.Item) throw new NotFoundException('Paciente não encontrado');

    const { profile_password, ...safe } = profile.Item as any;
    return { ...safe, permissions: link.Item.permissions };
  }
}

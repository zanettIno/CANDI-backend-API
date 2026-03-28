import {
  Injectable,
  Inject,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { CreateGroupDto, Group, GroupMember } from './dto/groups.dto';

interface AuthenticatedUser {
  profile_id: string;
  profile_email: string;
  profile_name: string;
  profile_nickname?: string;
}

@Injectable()
export class GroupsService {
  private readonly groupsTable = 'CANDIGroups';
  private readonly groupMembersTable = 'CANDIGroupMembers';

  constructor(
    @Inject('DYNAMO_CLIENT')
    private readonly db: DynamoDBDocumentClient,
  ) {}

  /**
   * Create a new group
   */
  async createGroup(user: AuthenticatedUser, dto: CreateGroupDto): Promise<Group> {
    try {
      const groupId = randomUUID();
      const now = new Date().toISOString();

      const group: Group = {
        group_id: groupId,
        group_name: dto.group_name.trim(),
        description: dto.description?.trim(),
        created_by: user.profile_id,
        created_at: now,
        member_count: 1,
        is_public: true,
      };

      // 1. Save group
      await this.db.send(
        new PutCommand({
          TableName: this.groupsTable,
          Item: group,
        }),
      );

      // 2. Add creator as admin member
      await this.db.send(
        new PutCommand({
          TableName: this.groupMembersTable,
          Item: {
            group_id: groupId,
            profile_id: user.profile_id,
            joined_at: now,
            role: 'admin',
          },
        }),
      );

      return group;
    } catch (error) {
      console.error('Erro ao criar grupo:', error);
      throw new InternalServerErrorException('Erro ao criar grupo');
    }
  }

  /**
   * Get all public groups
   */
  async getGroups(): Promise<Group[]> {
    try {
      const result = await this.db.send(
        new QueryCommand({
          TableName: this.groupsTable,
          IndexName: 'is_public-created_at',
          KeyConditionExpression: 'is_public = :public',
          ExpressionAttributeValues: { ':public': true },
          ScanIndexForward: false, // Most recent first
        }),
      );

      return (result.Items as Group[]) || [];
    } catch (error) {
      console.error('Erro ao buscar grupos:', error);
      throw new InternalServerErrorException('Erro ao buscar grupos');
    }
  }

  /**
   * Get group by ID
   */
  async getGroupById(groupId: string): Promise<Group> {
    try {
      const result = await this.db.send(
        new GetCommand({
          TableName: this.groupsTable,
          Key: { group_id: groupId },
        }),
      );

      if (!result.Item) {
        throw new BadRequestException('Grupo não encontrado');
      }

      return result.Item as Group;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Erro ao buscar grupo:', error);
      throw new InternalServerErrorException('Erro ao buscar grupo');
    }
  }

  /**
   * Get all groups that user is member of
   */
  async getUserGroups(userId: string): Promise<Group[]> {
    try {
      // Query group memberships
      const membershipsResult = await this.db.send(
        new QueryCommand({
          TableName: this.groupMembersTable,
          IndexName: 'profile_id-joined_at',
          KeyConditionExpression: 'profile_id = :userId',
          ExpressionAttributeValues: { ':userId': userId },
          ScanIndexForward: false, // Most recent first
        }),
      );

      const memberships = (membershipsResult.Items || []) as GroupMember[];

      // Get group details for each membership
      const groups: Group[] = [];
      for (const membership of memberships) {
        const groupResult = await this.db.send(
          new GetCommand({
            TableName: this.groupsTable,
            Key: { group_id: membership.group_id },
          }),
        );

        if (groupResult.Item) {
          groups.push(groupResult.Item as Group);
        }
      }

      return groups;
    } catch (error) {
      console.error('Erro ao buscar grupos do usuário:', error);
      throw new InternalServerErrorException('Erro ao buscar grupos do usuário');
    }
  }

  /**
   * Join a group
   */
  async joinGroup(groupId: string, userId: string): Promise<void> {
    try {
      // 1. Check if group exists
      const groupResult = await this.db.send(
        new GetCommand({
          TableName: this.groupsTable,
          Key: { group_id: groupId },
        }),
      );

      if (!groupResult.Item) {
        throw new BadRequestException('Grupo não encontrado');
      }

      // 2. Check if already member
      const memberResult = await this.db.send(
        new GetCommand({
          TableName: this.groupMembersTable,
          Key: { group_id: groupId, profile_id: userId },
        }),
      );

      if (memberResult.Item) {
        throw new BadRequestException('Você já é membro deste grupo');
      }

      // 3. Add member
      const now = new Date().toISOString();
      await this.db.send(
        new PutCommand({
          TableName: this.groupMembersTable,
          Item: {
            group_id: groupId,
            profile_id: userId,
            joined_at: now,
            role: 'member',
          },
        }),
      );

      // 4. Increment member count
      const group = groupResult.Item as Group;
      await this.db.send(
        new UpdateCommand({
          TableName: this.groupsTable,
          Key: { group_id: groupId },
          UpdateExpression: 'SET member_count = :count',
          ExpressionAttributeValues: { ':count': (group.member_count || 0) + 1 },
        }),
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Erro ao entrar no grupo:', error);
      throw new InternalServerErrorException('Erro ao entrar no grupo');
    }
  }

  /**
   * Leave a group
   */
  async leaveGroup(groupId: string, userId: string): Promise<void> {
    try {
      // 1. Check if group exists
      const groupResult = await this.db.send(
        new GetCommand({
          TableName: this.groupsTable,
          Key: { group_id: groupId },
        }),
      );

      if (!groupResult.Item) {
        throw new BadRequestException('Grupo não encontrado');
      }

      // 2. Check if member
      const memberResult = await this.db.send(
        new GetCommand({
          TableName: this.groupMembersTable,
          Key: { group_id: groupId, profile_id: userId },
        }),
      );

      if (!memberResult.Item) {
        throw new BadRequestException('Você não é membro deste grupo');
      }

      // 3. Remove member
      await this.db.send(
        new DeleteCommand({
          TableName: this.groupMembersTable,
          Key: { group_id: groupId, profile_id: userId },
        }),
      );

      // 4. Decrement member count
      const group = groupResult.Item as Group;
      const newCount = Math.max((group.member_count || 0) - 1, 0);

      await this.db.send(
        new UpdateCommand({
          TableName: this.groupsTable,
          Key: { group_id: groupId },
          UpdateExpression: 'SET member_count = :count',
          ExpressionAttributeValues: { ':count': newCount },
        }),
      );
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      console.error('Erro ao sair do grupo:', error);
      throw new InternalServerErrorException('Erro ao sair do grupo');
    }
  }

  /**
   * Check if user is member of group
   */
  async isMember(groupId: string, userId: string): Promise<boolean> {
    try {
      const result = await this.db.send(
        new GetCommand({
          TableName: this.groupMembersTable,
          Key: { group_id: groupId, profile_id: userId },
        }),
      );

      return !!result.Item;
    } catch (error) {
      console.error('Erro ao verificar membership:', error);
      return false;
    }
  }
}

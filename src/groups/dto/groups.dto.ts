import { IsNotEmpty, IsString, MaxLength, IsOptional } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100, { message: 'Nome do grupo não pode exceder 100 caracteres' })
  group_name: string;

  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Descrição não pode exceder 500 caracteres' })
  description?: string;
}

export interface Group {
  group_id: string;
  group_name: string;
  description?: string;
  created_by: string;
  created_at: string;
  member_count: number;
  is_public: boolean;
}

export interface GroupMember {
  group_id: string;
  profile_id: string;
  joined_at: string;
  role: 'admin' | 'member';
}

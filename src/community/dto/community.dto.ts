import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsString()
  @IsOptional()
  topic?: string;
}

export class JoinGroupDto {
  @IsString()
  @IsNotEmpty()
  group_id: string;
}

export class UpdateGroupDto {
  @IsString()
  @IsOptional()
  @MaxLength(80)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  description?: string;

  @IsString()
  @IsOptional()
  topic?: string;
}

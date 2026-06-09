import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class AddTeamMemberDto {
  @IsUUID()
  user_id!: string;

  @IsOptional()
  @IsBoolean()
  is_primary?: boolean;
}

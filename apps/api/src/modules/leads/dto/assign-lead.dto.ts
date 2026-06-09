import { IsOptional, IsUUID } from 'class-validator';

export class AssignLeadDto {
  @IsUUID()
  assignee_id!: string;

  @IsOptional()
  @IsUUID()
  team_id?: string;
}

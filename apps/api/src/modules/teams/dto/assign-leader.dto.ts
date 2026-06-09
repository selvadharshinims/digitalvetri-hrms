import { IsUUID } from 'class-validator';

export class AssignLeaderDto {
  @IsUUID()
  user_id!: string;
}

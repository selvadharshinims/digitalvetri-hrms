import { IsUUID } from 'class-validator';

export class AssignTicketDto {
  @IsUUID()
  assignee_id!: string;
}

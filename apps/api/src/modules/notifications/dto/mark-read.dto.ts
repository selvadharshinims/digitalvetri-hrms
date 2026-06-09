import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class MarkReadDto {
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  notification_ids?: string[];

  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

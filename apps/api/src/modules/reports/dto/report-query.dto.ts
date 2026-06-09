import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  team_id?: string;

  @IsOptional()
  @IsIn(['json', 'csv'])
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  format?: 'json' | 'csv';
}

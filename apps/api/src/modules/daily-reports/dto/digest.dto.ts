import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsUUID } from 'class-validator';

export class DigestQueryDto {
  /** Preset shorthand. If provided, overrides `from`/`to`. */
  @IsOptional()
  @IsIn(['yesterday', 'this_week', 'last_7_days', 'custom'])
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  range?: 'yesterday' | 'this_week' | 'last_7_days' | 'custom';

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsUUID()
  team_id?: string;
}

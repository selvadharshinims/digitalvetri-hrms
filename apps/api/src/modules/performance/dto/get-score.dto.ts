import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GetScoreDto {
  @IsOptional()
  @IsDateString()
  period_start?: string;

  @IsOptional()
  @IsDateString()
  period_end?: string;

  /** If `period_start`/`end` are omitted, look back this many days from today. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  rolling_days?: number;

  /** Force a fresh compute instead of returning the latest cached row. */
  @IsOptional()
  @Type(() => Boolean)
  recompute?: boolean;
}

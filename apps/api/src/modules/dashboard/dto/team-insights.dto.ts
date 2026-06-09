import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional } from 'class-validator';

export class TeamInsightsDto {
  /** Window length in days. Default 7. */
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @IsIn([7, 14, 30])
  days?: number;
}

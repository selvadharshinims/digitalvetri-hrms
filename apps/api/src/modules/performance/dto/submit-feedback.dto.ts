import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitFeedbackDto {
  @IsUUID()
  user_id!: string;

  @IsDateString()
  period_start!: string;

  @IsDateString()
  period_end!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  quality!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  ownership!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  collaboration!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

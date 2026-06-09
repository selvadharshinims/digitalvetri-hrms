import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class WeightsDto {
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) attendance!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) task!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) lead!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) project!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) feedback!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(1) discipline!: number;
}

export class UpdateScoringConfigDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => WeightsDto)
  weights?: WeightsDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  stale_lead_days?: number;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'report_cutoff must be HH:mm' })
  report_cutoff?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,2}:\d{2}$/, { message: 'work_start_time must be HH:mm' })
  work_start_time?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(365)
  scoring_period_days?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  lead_activity_target?: number;
}

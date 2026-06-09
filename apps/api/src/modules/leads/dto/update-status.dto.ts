import { LeadStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateLeadStatusDto {
  @IsEnum(LeadStatus)
  status!: LeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsDateString()
  next_follow_up?: string;

  /** Captured when transitioning to `converted`. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deal_value?: number;
}

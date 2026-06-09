import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class SubmitDailyReportDto {
  /** YYYY-MM-DD. Defaults to today if omitted; only today is editable. */
  @IsOptional()
  @IsDateString()
  report_date?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  todays_work!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  challenges?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  learnings?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  tomorrows_plan?: string;
}

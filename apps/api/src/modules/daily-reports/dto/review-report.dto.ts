import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewDailyReportDto {
  @IsBoolean()
  acknowledged!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  review_note?: string;
}

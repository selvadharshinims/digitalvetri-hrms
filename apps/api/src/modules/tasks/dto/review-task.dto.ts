import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class ReviewTaskDto {
  @IsEnum(['approve', 'reopen'] as const)
  decision!: 'approve' | 'reopen';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;
}

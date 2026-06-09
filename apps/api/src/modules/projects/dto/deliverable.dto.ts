import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDeliverableDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;
}

export class UpdateDeliverableDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsBoolean()
  is_done?: boolean;
}

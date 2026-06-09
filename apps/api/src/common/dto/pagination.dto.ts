import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 25;
}

export function paginationFrom(dto: PaginationQueryDto): { page: number; limit: number; skip: number } {
  const page = dto.page ?? 1;
  const limit = dto.limit ?? 25;
  return { page, limit, skip: (page - 1) * limit };
}

export interface PaginatedResult<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

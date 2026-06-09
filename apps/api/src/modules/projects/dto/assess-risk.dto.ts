import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

const MAX_BATCH = 20;

export class AssessProjectRisksDto {
  /**
   * Explicit list of project IDs to assess. If omitted, the endpoint picks
   * the top in-scope non-terminal projects (capped at 20 per call).
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_BATCH)
  @IsUUID('all', { each: true })
  project_ids?: string[];
}

export const PROJECT_RISK_BATCH_LIMIT = MAX_BATCH;

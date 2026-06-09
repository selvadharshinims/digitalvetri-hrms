import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
} from 'class-validator';

const MAX_BATCH = 30;

export class ScoreLeadsDto {
  /**
   * Explicit list of lead IDs to score. If omitted, the endpoint scores the
   * top open in-scope leads (capped at 30 per call to keep the prompt and
   * token usage bounded).
   */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(MAX_BATCH)
  @IsUUID('all', { each: true })
  lead_ids?: string[];
}

export const LEAD_SCORING_BATCH_LIMIT = MAX_BATCH;

import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  assertValidWeights,
  DEFAULT_WEIGHTS_FRACTION,
  type WeightsFraction,
} from '../performance/scoring/formulas';
import { PrismaService } from '../../prisma/prisma.service';
import type { UpdateScoringConfigDto } from './dto/update-scoring-config.dto';

@Injectable()
export class ConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async getScoring() {
    const row = await this.prisma.scoringConfig.findUnique({ where: { is_active: true } });
    if (row) return this.shape(row);
    // Self-heal: seed a default row on first read if it's missing.
    const created = await this.prisma.scoringConfig.create({
      data: {
        is_active: true,
        weights: DEFAULT_WEIGHTS_FRACTION as unknown as Prisma.InputJsonValue,
      },
    });
    return this.shape(created);
  }

  async updateScoring(actor: AuthenticatedUser, dto: UpdateScoringConfigDto) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can change scoring configuration');
    }
    if (dto.weights) {
      try {
        assertValidWeights(dto.weights as WeightsFraction);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }

    const existing = await this.getScoring();
    const updated = await this.prisma.scoringConfig.update({
      where: { is_active: true },
      data: {
        weights: dto.weights
          ? (dto.weights as unknown as Prisma.InputJsonValue)
          : (existing.weights as unknown as Prisma.InputJsonValue),
        stale_lead_days: dto.stale_lead_days ?? undefined,
        report_cutoff: dto.report_cutoff ?? undefined,
        work_start_time: dto.work_start_time ?? undefined,
        scoring_period_days: dto.scoring_period_days ?? undefined,
        lead_activity_target: dto.lead_activity_target ?? undefined,
        updated_by: actor.id,
      },
    });
    return this.shape(updated);
  }

  private shape(row: {
    weights: Prisma.JsonValue;
    stale_lead_days: number;
    report_cutoff: string;
    work_start_time: string;
    scoring_period_days: number;
    lead_activity_target: number;
    updated_at: Date;
    updated_by: string | null;
  }) {
    return {
      weights: row.weights as unknown as WeightsFraction,
      stale_lead_days: row.stale_lead_days,
      report_cutoff: row.report_cutoff,
      work_start_time: row.work_start_time,
      scoring_period_days: row.scoring_period_days,
      lead_activity_target: row.lead_activity_target,
      updated_at: row.updated_at.toISOString(),
      updated_by: row.updated_by,
    };
  }
}

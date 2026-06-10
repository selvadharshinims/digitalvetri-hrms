import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { LeadStatus, Prisma, Role } from '@prisma/client';
import { SYSTEM_ACTOR } from '../../common/constants/system-actor';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AnthropicService } from '../ai/anthropic.service';
import { paginationFrom, type PaginatedResult } from '../../common/dto/pagination.dto';
import { canManageLead, leadScopeWhere } from '../../common/utils/scope';
import {
  LeadScoringService,
  type LeadToScore,
  type OrgConversionContext,
} from '../ai/lead-scoring.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { AssignLeadDto } from './dto/assign-lead.dto';
import type { CreateLeadDto } from './dto/create-lead.dto';
import type { ImportLeadsDto } from './dto/import-leads.dto';
import type { ListLeadsDto } from './dto/list-leads.dto';
import { LEAD_SCORING_BATCH_LIMIT, ScoreLeadsDto } from './dto/score-leads.dto';
import type { UpdateLeadDto } from './dto/update-lead.dto';
import type { UpdateLeadStatusDto } from './dto/update-status.dto';

const LEAD_LIST_SELECT = {
  id: true,
  name: true,
  phone: true,
  email: true,
  source: true,
  service_interest: true,
  location: true,
  notes: true,
  estimated_value: true,
  status: true,
  assigned_to: true,
  team_id: true,
  next_follow_up: true,
  deal_value: true,
  converted_at: true,
  last_activity_at: true,
  ai_score: true,
  ai_score_band: true,
  ai_score_signal: true,
  ai_score_action: true,
  ai_score_model: true,
  ai_score_at: true,
  created_at: true,
  updated_at: true,
  assignee: { select: { id: true, full_name: true } },
  team: { select: { id: true, name: true } },
} satisfies Prisma.LeadSelect;

/** Smaller select used to build LeadToScore inputs for the scoring service. */
const LEAD_SCORE_INPUT_SELECT = {
  id: true,
  name: true,
  source: true,
  service_interest: true,
  location: true,
  status: true,
  estimated_value: true,
  last_activity_at: true,
  created_at: true,
  phone: true,
  email: true,
  notes: true,
  assignee: { select: { full_name: true } },
} satisfies Prisma.LeadSelect;

const TERMINAL_STATUSES: LeadStatus[] = ['converted', 'lost', 'invalid'];

@Injectable()
export class LeadsService {
  private readonly logger = new Logger(LeadsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly scoring: LeadScoringService,
    private readonly anthropic: AnthropicService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListLeadsDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = paginationFrom(query);
    const where: Prisma.LeadWhereInput = {
      AND: [
        leadScopeWhere(actor),
        query.status ? { status: query.status } : {},
        query.assigned_to ? { assigned_to: query.assigned_to } : {},
        query.team_id ? { team_id: query.team_id } : {},
        query.source ? { source: { equals: query.source, mode: 'insensitive' } } : {},
        query.unassigned ? { assigned_to: null } : {},
        query.from ? { created_at: { gte: new Date(query.from) } } : {},
        query.to ? { created_at: { lte: new Date(query.to) } } : {},
        query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' } },
                { phone: { contains: query.q } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.lead.findMany({
        where,
        select: LEAD_LIST_SELECT,
        orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
        take: limit,
        skip,
      }),
      this.prisma.lead.count({ where }),
    ]);

    return { data: rows, meta: { page, limit, total } };
  }

  async funnel(actor: AuthenticatedUser) {
    const grouped = await this.prisma.lead.groupBy({
      by: ['status'],
      where: leadScopeWhere(actor),
      _count: { _all: true },
    });
    const out: Record<LeadStatus, number> = {
      new: 0,
      contacted: 0,
      interested: 0,
      follow_up: 0,
      converted: 0,
      lost: 0,
      invalid: 0,
    };
    for (const row of grouped) out[row.status] = row._count._all;
    return out;
  }

  async stale(actor: AuthenticatedUser, days?: number) {
    const config = await this.prisma.scoringConfig.findUnique({ where: { is_active: true } });
    const threshold = days ?? config?.stale_lead_days ?? 3;
    const cutoff = new Date(Date.now() - threshold * 24 * 60 * 60 * 1000);
    return this.prisma.lead.findMany({
      where: {
        AND: [
          leadScopeWhere(actor),
          { status: { notIn: TERMINAL_STATUSES } },
          { OR: [{ last_activity_at: { lt: cutoff } }, { last_activity_at: null, created_at: { lt: cutoff } }] },
        ],
      },
      select: LEAD_LIST_SELECT,
      orderBy: [{ last_activity_at: 'asc' }, { created_at: 'asc' }],
      take: 200,
    });
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id }, leadScopeWhere(actor)] },
      select: {
        ...LEAD_LIST_SELECT,
        activities: {
          orderBy: { created_at: 'desc' },
          take: 100,
          select: {
            id: true,
            lead_id: true,
            actor_id: true,
            from_status: true,
            to_status: true,
            note: true,
            created_at: true,
          },
        },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async getActivities(actor: AuthenticatedUser, id: string) {
    await this.ensureVisible(actor, id);
    return this.prisma.leadActivity.findMany({
      where: { lead_id: id },
      orderBy: { created_at: 'desc' },
      take: 200,
    });
  }

  async create(actor: AuthenticatedUser, dto: CreateLeadDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot create leads directly');
    }
    await this.validateAssignmentTargets(dto.team_id, dto.assigned_to);

    const lead = await this.prisma.lead.create({
      data: {
        name: dto.name,
        phone: dto.phone ?? null,
        email: dto.email?.toLowerCase() ?? null,
        source: dto.source ?? null,
        service_interest: dto.service_interest ?? null,
        location: dto.location ?? null,
        notes: dto.notes ?? null,
        estimated_value: dto.estimated_value ?? null,
        team_id: dto.team_id ?? null,
        assigned_to: dto.assigned_to ?? null,
        last_activity_at: new Date(),
        activities: {
          create: {
            actor_id: actor.id,
            to_status: 'new',
            note: dto.assigned_to ? 'Created and assigned' : 'Created',
          },
        },
      },
      select: LEAD_LIST_SELECT,
    });
    if (dto.assigned_to) {
      void this.notifications.notifyLeadAssigned(lead.id, dto.assigned_to, actor.id);
    }
    return lead;
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateLeadDto) {
    const existing = await this.requireManageable(actor, id);

    if (dto.team_id && actor.role === Role.team_leader) {
      if (!actor.led_team_ids.includes(dto.team_id)) {
        throw new ForbiddenException('Cannot move lead to a team you do not lead');
      }
    }

    return this.prisma.lead.update({
      where: { id: existing.id },
      data: {
        name: dto.name ?? undefined,
        phone: dto.phone ?? undefined,
        email: dto.email ? dto.email.toLowerCase() : undefined,
        source: dto.source ?? undefined,
        service_interest: dto.service_interest ?? undefined,
        location: dto.location ?? undefined,
        notes: dto.notes ?? undefined,
        estimated_value: dto.estimated_value ?? undefined,
        next_follow_up: dto.next_follow_up ? new Date(dto.next_follow_up) : undefined,
        team_id: dto.team_id ?? undefined,
        last_activity_at: new Date(),
      },
      select: LEAD_LIST_SELECT,
    });
  }

  async assign(actor: AuthenticatedUser, id: string, dto: AssignLeadDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Only admins or team leaders can assign leads');
    }
    const existing = await this.requireManageable(actor, id);
    await this.validateAssignmentTargets(dto.team_id, dto.assignee_id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id: existing.id },
        data: {
          assigned_to: dto.assignee_id,
          team_id: dto.team_id ?? undefined,
          last_activity_at: new Date(),
        },
        select: LEAD_LIST_SELECT,
      });
      await tx.leadActivity.create({
        data: {
          lead_id: id,
          actor_id: actor.id,
          note: `Assigned to user ${dto.assignee_id}`,
        },
      });
      return lead;
    });
    if (dto.assignee_id !== existing.assigned_to) {
      void this.notifications.notifyLeadAssigned(id, dto.assignee_id, actor.id);
    }
    return updated;
  }

  async changeStatus(actor: AuthenticatedUser, id: string, dto: UpdateLeadStatusDto) {
    const existing = await this.requireManageable(actor, id);

    if (dto.status === 'converted' && !dto.deal_value) {
      throw new BadRequestException('deal_value is required when marking a lead as converted');
    }

    const isConverting = dto.status === 'converted' && existing.status !== 'converted';
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.update({
        where: { id: existing.id },
        data: {
          status: dto.status,
          next_follow_up: dto.next_follow_up ? new Date(dto.next_follow_up) : undefined,
          deal_value: dto.deal_value ?? undefined,
          converted_at: isConverting ? now : undefined,
          last_activity_at: now,
        },
        select: LEAD_LIST_SELECT,
      });
      await tx.leadActivity.create({
        data: {
          lead_id: id,
          actor_id: actor.id,
          from_status: existing.status,
          to_status: dto.status,
          note: dto.note ?? null,
        },
      });
      return lead;
    });
  }

  async importMany(actor: AuthenticatedUser, dto: ImportLeadsDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Only admins or team leaders can import leads');
    }
    await this.validateAssignmentTargets(dto.team_id, dto.assigned_to);

    // Dedupe within the file and against existing rows on phone/email.
    const phones = dto.rows.map((r) => r.phone).filter((p): p is string => !!p);
    const emails = dto.rows.map((r) => r.email?.toLowerCase()).filter((e): e is string => !!e);

    const dedupeOr: Prisma.LeadWhereInput[] = [];
    if (phones.length) dedupeOr.push({ phone: { in: phones } });
    if (emails.length) dedupeOr.push({ email: { in: emails } });

    const existing = dedupeOr.length
      ? await this.prisma.lead.findMany({
          where: { OR: dedupeOr },
          select: { phone: true, email: true },
        })
      : [];
    const existingPhones = new Set(existing.map((e) => e.phone).filter(Boolean));
    const existingEmails = new Set(existing.map((e) => e.email?.toLowerCase()).filter(Boolean));

    const seenPhones = new Set<string>();
    const seenEmails = new Set<string>();
    const toCreate: Prisma.LeadCreateManyInput[] = [];
    const errors: { row: number; message: string }[] = [];
    let skipped = 0;
    const now = new Date();

    dto.rows.forEach((row, idx) => {
      const phone = row.phone?.trim() || undefined;
      const email = row.email?.toLowerCase().trim() || undefined;

      if (phone && (existingPhones.has(phone) || seenPhones.has(phone))) {
        skipped += 1;
        return;
      }
      if (email && (existingEmails.has(email) || seenEmails.has(email))) {
        skipped += 1;
        return;
      }
      if (!phone && !email) {
        errors.push({ row: idx + 1, message: 'Row needs at least a phone or email' });
        return;
      }

      if (phone) seenPhones.add(phone);
      if (email) seenEmails.add(email);

      toCreate.push({
        name: row.name,
        phone: phone ?? null,
        email: email ?? null,
        source: row.source ?? null,
        service_interest: row.service_interest ?? null,
        location: row.location ?? null,
        notes: row.notes ?? null,
        estimated_value: row.estimated_value ?? null,
        team_id: row.team_id ?? dto.team_id ?? null,
        assigned_to: row.assigned_to ?? dto.assigned_to ?? null,
        last_activity_at: now,
      });
    });

    if (toCreate.length) {
      await this.prisma.lead.createMany({ data: toCreate });
    }
    this.logger.log(
      `Lead import by ${actor.email}: ${toCreate.length} created, ${skipped} duplicates, ${errors.length} errors`,
    );
    return { imported: toCreate.length, skipped_duplicates: skipped, errors };
  }

  /**
   * AI-scores a batch of leads (default: top open in-scope leads, max 30).
   * Persists `ai_score`/`ai_score_band`/`ai_score_signal`/`ai_score_action`/
   * `ai_score_model`/`ai_score_at` on each lead so the score is visible
   * across the app without re-calling Claude on every page load.
   */
  async scoreLeads(actor: AuthenticatedUser, dto: ScoreLeadsDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot trigger AI lead scoring');
    }

    // Resolve target leads. Explicit list is scope-checked via leadScopeWhere;
    // auto-pick mode grabs the top open in-scope leads with the most recent
    // activity (most likely to be actionable).
    const leadRows = dto.lead_ids?.length
      ? await this.prisma.lead.findMany({
          where: {
            AND: [
              leadScopeWhere(actor),
              { id: { in: dto.lead_ids } },
            ],
          },
          select: LEAD_SCORE_INPUT_SELECT,
        })
      : await this.prisma.lead.findMany({
          where: {
            AND: [
              leadScopeWhere(actor),
              { status: { notIn: ['converted', 'lost', 'invalid'] } },
            ],
          },
          select: LEAD_SCORE_INPUT_SELECT,
          orderBy: [
            { last_activity_at: 'desc' },
            { created_at: 'desc' },
          ],
          take: LEAD_SCORING_BATCH_LIMIT,
        });

    if (leadRows.length === 0) {
      return {
        scored: [],
        model: 'n/a',
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
        generated_at: new Date().toISOString(),
      };
    }

    const orgContext = await this.buildOrgContext(actor);
    const now = Date.now();
    const toScore: LeadToScore[] = leadRows.map((l) => ({
      id: l.id,
      name: l.name,
      source: l.source,
      service_interest: l.service_interest,
      location: l.location,
      status: l.status,
      estimated_value: l.estimated_value ? Number(l.estimated_value) : null,
      days_since_activity: l.last_activity_at
        ? Math.floor((now - l.last_activity_at.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      days_since_created: Math.floor(
        (now - l.created_at.getTime()) / (1000 * 60 * 60 * 24),
      ),
      has_phone: !!l.phone,
      has_email: !!l.email,
      notes_excerpt: l.notes ? l.notes.slice(0, 240) : null,
      assignee_name: l.assignee?.full_name ?? null,
    }));

    const result = await this.scoring.score({ leads: toScore, org: orgContext });

    // Persist back to each lead. Use a transaction to keep the batch atomic.
    if (result.scored.length > 0) {
      const stampedAt = new Date();
      await this.prisma.$transaction(
        result.scored.map((s) =>
          this.prisma.lead.update({
            where: { id: s.lead_id },
            data: {
              ai_score: s.score,
              ai_score_band: s.band,
              ai_score_signal: s.top_signal,
              ai_score_action: s.suggested_action,
              ai_score_model: result.model,
              ai_score_at: stampedAt,
            },
          }),
        ),
      );
    }

    return {
      scored: result.scored,
      model: result.model,
      usage: result.usage,
      generated_at: new Date().toISOString(),
    };
  }

  /** Builds the org-wide conversion context the scorer uses as a baseline. */
  private async buildOrgContext(actor: AuthenticatedUser): Promise<OrgConversionContext> {
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const inScope = leadScopeWhere(actor);

    const [touchedRows, convertedRows] = await Promise.all([
      this.prisma.lead.findMany({
        where: {
          AND: [
            inScope,
            { OR: [{ last_activity_at: { gte: ninetyDaysAgo } }, { converted_at: { gte: ninetyDaysAgo } }] },
          ],
        },
        select: { source: true, status: true, deal_value: true },
      }),
      this.prisma.lead.findMany({
        where: {
          AND: [
            inScope,
            { status: 'converted' },
            { converted_at: { gte: ninetyDaysAgo } },
          ],
        },
        select: { deal_value: true },
      }),
    ]);

    const bySource = new Map<string, { worked: number; converted: number }>();
    for (const r of touchedRows) {
      const key = (r.source ?? 'Unknown').trim() || 'Unknown';
      const slot = bySource.get(key) ?? { worked: 0, converted: 0 };
      slot.worked += 1;
      if (r.status === 'converted') slot.converted += 1;
      bySource.set(key, slot);
    }

    const by_source = [...bySource.entries()]
      .map(([source, v]) => ({
        source,
        worked: v.worked,
        converted: v.converted,
        conversion_rate_pct:
          v.worked > 0 ? Math.round((v.converted / v.worked) * 100) : 0,
      }))
      .sort((a, b) => b.worked - a.worked)
      .slice(0, 12);

    const dealValues = convertedRows
      .map((r) => (r.deal_value ? Number(r.deal_value) : 0))
      .filter((v) => v > 0);
    const avg_recent_deal_value =
      dealValues.length > 0
        ? Math.round(dealValues.reduce((s, v) => s + v, 0) / dealValues.length)
        : 0;

    return {
      by_source,
      avg_recent_deal_value,
      total_converted_last_90_days: convertedRows.length,
    };
  }

  private async ensureVisible(actor: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { AND: [{ id }, leadScopeWhere(actor)] },
      select: { id: true, assigned_to: true, team_id: true, status: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  private async requireManageable(actor: AuthenticatedUser, id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { id: true, assigned_to: true, team_id: true, status: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!canManageLead(actor, lead)) {
      throw new ForbiddenException('Cannot modify this lead');
    }
    return lead;
  }

  /**
   * Nightly AI rescoring of the top open leads org-wide. Auto-pick mode in
   * `scoreLeads` already caps the batch at 30 and ranks by activity — exactly
   * what a daily refresh needs. Skips cleanly when Anthropic isn't configured.
   */
  @Cron('0 3 * * *', { name: 'leads-ai-score-nightly' })
  async cronScoreLeads() {
    if (!this.anthropic.isAvailable()) return;
    try {
      const result = await this.scoreLeads(SYSTEM_ACTOR, {});
      this.logger.log(
        `Lead scoring cron: ${result.scored.length} leads scored (model: ${result.model})`,
      );
    } catch (err) {
      this.logger.error(`Lead scoring cron failed: ${(err as Error).message}`);
    }
  }

  private async validateAssignmentTargets(teamId?: string | null, assigneeId?: string | null) {
    if (teamId) {
      const team = await this.prisma.team.findUnique({ where: { id: teamId }, select: { id: true } });
      if (!team) throw new BadRequestException('team_id does not exist');
    }
    if (assigneeId) {
      const user = await this.prisma.user.findUnique({
        where: { id: assigneeId },
        select: { id: true, status: true },
      });
      if (!user) throw new BadRequestException('assigned_to user does not exist');
      if (user.status !== 'active') {
        throw new BadRequestException('assigned_to user is not active');
      }
    }
  }
}

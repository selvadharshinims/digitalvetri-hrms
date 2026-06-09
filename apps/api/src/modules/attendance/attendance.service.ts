import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginationFrom, type PaginatedResult } from '../../common/dto/pagination.dto';
import {
  attendanceScopeWhere,
  canMarkAttendanceFor,
  userScopeWhere,
} from '../../common/utils/scope';
import {
  endOfDay,
  isWorkingDay,
  parseIsoDate,
  startOfDay,
  todayAtTime,
  workingDaysBetween,
} from '../../common/utils/working-days';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AttendanceReportDto,
  ListAttendanceDto,
} from './dto/list-attendance.dto';
import type { MarkAttendanceDto } from './dto/mark-attendance.dto';

const ATTENDANCE_LIST_SELECT = {
  id: true,
  user_id: true,
  date: true,
  status: true,
  check_in: true,
  check_out: true,
  marked_by: true,
  notes: true,
  created_at: true,
  updated_at: true,
  user: { select: { id: true, full_name: true, email: true } },
} satisfies Prisma.AttendanceSelect;

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser, query: ListAttendanceDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = paginationFrom(query);
    const where: Prisma.AttendanceWhereInput = {
      AND: [
        attendanceScopeWhere(actor),
        query.user_id ? { user_id: query.user_id } : {},
        query.team_id
          ? { user: { memberships: { some: { team_id: query.team_id } } } }
          : {},
        query.status ? { status: query.status } : {},
        query.from ? { date: { gte: parseIsoDate(query.from) } } : {},
        query.to ? { date: { lte: parseIsoDate(query.to) } } : {},
      ],
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.attendance.findMany({
        where,
        select: ATTENDANCE_LIST_SELECT,
        orderBy: [{ date: 'desc' }, { user: { full_name: 'asc' } }],
        take: limit,
        skip,
      }),
      this.prisma.attendance.count({ where }),
    ]);
    return { data: rows, meta: { page, limit, total } };
  }

  async checkIn(actor: AuthenticatedUser) {
    const today = startOfDay(new Date());
    if (!isWorkingDay(today)) {
      throw new BadRequestException('Today is not a working day');
    }

    const existing = await this.prisma.attendance.findUnique({
      where: { user_id_date: { user_id: actor.id, date: today } },
      select: ATTENDANCE_LIST_SELECT,
    });
    if (existing) {
      if (existing.check_in) {
        return { attendance: existing, late: existing.status === 'late' };
      }
      // Row exists from a leader pre-mark; just stamp check_in now.
      const updated = await this.prisma.attendance.update({
        where: { id: existing.id },
        data: { check_in: new Date() },
        select: ATTENDANCE_LIST_SELECT,
      });
      return { attendance: updated, late: updated.status === 'late' };
    }

    const config = await this.prisma.scoringConfig.findUnique({ where: { is_active: true } });
    const startTimeRaw = config?.work_start_time ?? '10:00';
    const startToday = todayAtTime(startTimeRaw);
    const now = new Date();
    const isLate = !!startToday && now.getTime() > startToday.getTime();

    const created = await this.prisma.attendance.create({
      data: {
        user_id: actor.id,
        date: today,
        status: isLate ? AttendanceStatus.late : AttendanceStatus.present,
        check_in: now,
      },
      select: ATTENDANCE_LIST_SELECT,
    });
    return { attendance: created, late: isLate };
  }

  async checkOut(actor: AuthenticatedUser) {
    const today = startOfDay(new Date());
    const existing = await this.prisma.attendance.findUnique({
      where: { user_id_date: { user_id: actor.id, date: today } },
      select: { id: true, check_in: true, check_out: true },
    });
    if (!existing) throw new BadRequestException('You have not checked in today');
    if (existing.check_out) return this.fetchOne(actor.id, today);
    await this.prisma.attendance.update({
      where: { id: existing.id },
      data: { check_out: new Date() },
    });
    return this.fetchOne(actor.id, today);
  }

  async mark(actor: AuthenticatedUser, dto: MarkAttendanceDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
      select: { id: true, memberships: { select: { team_id: true } } },
    });
    if (!target) throw new NotFoundException('User not found');
    const team_ids = target.memberships.map((m) => m.team_id);
    if (!canMarkAttendanceFor(actor, { id: target.id, team_ids })) {
      throw new ForbiddenException('Cannot mark attendance for this user');
    }

    const date = parseIsoDate(dto.date);
    return this.prisma.attendance.upsert({
      where: { user_id_date: { user_id: dto.user_id, date } },
      create: {
        user_id: dto.user_id,
        date,
        status: dto.status,
        notes: dto.notes ?? null,
        marked_by: actor.id,
      },
      update: {
        status: dto.status,
        notes: dto.notes ?? undefined,
        marked_by: actor.id,
      },
      select: ATTENDANCE_LIST_SELECT,
    });
  }

  /**
   * Today snapshot for the leader/admin view: one row per visible user with
   * their (possibly null) attendance row for today.
   */
  async todaySnapshot(actor: AuthenticatedUser, teamId?: string) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot view team attendance');
    }
    const today = startOfDay(new Date());
    const where: Prisma.UserWhereInput = {
      AND: [
        userScopeWhere(actor),
        { status: 'active' },
        teamId ? { memberships: { some: { team_id: teamId } } } : {},
      ],
    };
    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        full_name: true,
        email: true,
        attendance_records: {
          where: { date: today },
          select: {
            id: true,
            status: true,
            check_in: true,
            check_out: true,
            notes: true,
          },
          take: 1,
        },
      },
      orderBy: { full_name: 'asc' },
    });

    return users.map((u) => {
      const att = u.attendance_records[0];
      return {
        user_id: u.id,
        full_name: u.full_name,
        email: u.email,
        attendance_id: att?.id ?? null,
        status: att?.status ?? null,
        check_in: att?.check_in?.toISOString() ?? null,
        check_out: att?.check_out?.toISOString() ?? null,
        notes: att?.notes ?? null,
      };
    });
  }

  /**
   * Monthly per-user summary: present/absent/leave/half_day/late counts and
   * an attendance_pct derived per FR-ATT-6 (formula matches PerformanceScoring §10.2 A).
   */
  async monthlyReport(actor: AuthenticatedUser, dto: AttendanceReportDto) {
    if (actor.role === Role.intern) {
      throw new ForbiddenException('Interns cannot view organization-wide reports');
    }
    const monthStart = dto.month ? parseMonth(dto.month) : startOfMonth(new Date());
    const monthEnd = endOfMonth(monthStart);
    const working = workingDaysBetween(monthStart, monthEnd);
    const workingCount = working.length;

    const userWhere: Prisma.UserWhereInput = {
      AND: [
        userScopeWhere(actor),
        dto.team_id ? { memberships: { some: { team_id: dto.team_id } } } : {},
      ],
    };
    const users = await this.prisma.user.findMany({
      where: userWhere,
      select: {
        id: true,
        full_name: true,
        attendance_records: {
          where: {
            date: { gte: monthStart, lte: endOfDay(monthEnd) },
          },
          select: { status: true },
        },
      },
      orderBy: { full_name: 'asc' },
    });

    return users.map((u) => {
      const counts = { present: 0, absent: 0, leave: 0, half_day: 0, late: 0 };
      for (const r of u.attendance_records) counts[r.status] += 1;
      const presentEquivalent = counts.present + counts.late + 0.5 * counts.half_day;
      const attendance_pct =
        workingCount > 0 ? Math.round((presentEquivalent / workingCount) * 100) : 0;
      return {
        user_id: u.id,
        full_name: u.full_name,
        working_days: workingCount,
        ...counts,
        attendance_pct,
      };
    });
  }

  private async fetchOne(userId: string, date: Date) {
    return this.prisma.attendance.findUnique({
      where: { user_id_date: { user_id: userId, date } },
      select: ATTENDANCE_LIST_SELECT,
    });
  }
}

function startOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  return d;
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function parseMonth(yyyymm: string): Date {
  const m = yyyymm.match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new BadRequestException('month must be in YYYY-MM format');
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) throw new BadRequestException('Invalid month');
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

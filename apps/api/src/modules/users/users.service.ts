import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { paginationFrom, type PaginatedResult } from '../../common/dto/pagination.dto';
import { userScopeWhere } from '../../common/utils/scope';
import { EmailService } from '../notifications/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CreateUserDto } from './dto/create-user.dto';
import type { ListUsersDto } from './dto/list-users.dto';
import type { UpdateUserDto } from './dto/update-user.dto';

const INVITE_TTL_DAYS = 7;

const USER_PUBLIC_SELECT = {
  id: true,
  full_name: true,
  email: true,
  phone: true,
  whatsapp_enabled: true,
  role: true,
  photo_url: true,
  dob: true,
  address: true,
  college: true,
  degree: true,
  year_of_study: true,
  department: true,
  internship_role: true,
  joining_date: true,
  status: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  async list(actor: AuthenticatedUser, query: ListUsersDto): Promise<PaginatedResult<unknown>> {
    const { page, limit, skip } = paginationFrom(query);
    const where: Prisma.UserWhereInput = {
      AND: [
        userScopeWhere(actor),
        query.role ? { role: query.role } : {},
        query.status ? { status: query.status } : {},
        query.team_id ? { memberships: { some: { team_id: query.team_id } } } : {},
        query.q
          ? {
              OR: [
                { full_name: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {},
      ],
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          ...USER_PUBLIC_SELECT,
          memberships: { select: { team_id: true, is_primary: true } },
        },
        orderBy: [{ status: 'asc' }, { full_name: 'asc' }],
        take: limit,
        skip,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: rows, meta: { page, limit, total } };
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { AND: [{ id }, userScopeWhere(actor)] },
      select: {
        ...USER_PUBLIC_SELECT,
        memberships: {
          select: {
            team_id: true,
            is_primary: true,
            joined_at: true,
            team: { select: { id: true, name: true } },
          },
        },
        led_teams: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can create users');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });
    if (existing) throw new ConflictException('A user with that email already exists');

    if (dto.team_ids?.length) {
      const teamCount = await this.prisma.team.count({ where: { id: { in: dto.team_ids } } });
      if (teamCount !== dto.team_ids.length) {
        throw new BadRequestException('One or more team_ids do not exist');
      }
    }

    // Temporary password is a fallback so the account is usable even if the
    // invite email never lands (no SMTP, wrong address, spam folder). The
    // admin can copy it from the create-user response.
    const tempPassword = generateTempPassword();
    const password_hash = await argon2.hash(tempPassword);

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

    const created = await this.prisma.user.create({
      data: {
        full_name: dto.full_name,
        email: dto.email.toLowerCase(),
        phone: dto.phone ?? null,
        role: dto.role,
        college: dto.college ?? null,
        degree: dto.degree ?? null,
        year_of_study: dto.year_of_study ?? null,
        department: dto.department ?? null,
        internship_role: dto.internship_role ?? null,
        joining_date: dto.joining_date ? new Date(dto.joining_date) : null,
        password_hash,
        invite_token: inviteToken,
        invite_token_expires_at: inviteExpires,
        memberships: dto.team_ids?.length
          ? {
              create: dto.team_ids.map((team_id, idx) => ({
                team_id,
                is_primary: idx === 0,
              })),
            }
          : undefined,
      },
      select: USER_PUBLIC_SELECT,
    });

    const inviteUrl = this.buildInviteUrl(inviteToken);
    await this.sendInviteEmail(created.email, created.full_name, inviteUrl);

    this.logger.log(
      `Created user <${created.email}>. Invite URL: ${inviteUrl} (fallback temp password also issued).`,
    );

    return {
      user: created,
      temp_password: tempPassword,
      invite_url: inviteUrl,
      invite_expires_at: inviteExpires.toISOString(),
    };
  }

  /**
   * Re-issue an invite token + email. Useful when the original invite expired
   * or the user lost it. Doesn't touch the password — the temp password set
   * at create-time still works as a fallback.
   */
  async invite(actor: AuthenticatedUser, id: string) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can resend invites');
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, full_name: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'active') {
      throw new BadRequestException('Cannot invite an inactive user');
    }

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.user.update({
      where: { id },
      data: { invite_token: inviteToken, invite_token_expires_at: inviteExpires },
    });

    const inviteUrl = this.buildInviteUrl(inviteToken);
    await this.sendInviteEmail(user.email, user.full_name, inviteUrl);

    return { invite_url: inviteUrl, invite_expires_at: inviteExpires.toISOString() };
  }

  private buildInviteUrl(token: string): string {
    const base = this.config.get<string>('APP_BASE_URL', 'http://localhost:3000');
    return `${base.replace(/\/$/, '')}/set-password?token=${encodeURIComponent(token)}`;
  }

  private async sendInviteEmail(to: string, fullName: string, inviteUrl: string) {
    await this.email.send({
      to,
      subject: '[DV-WMS] You have been invited to DigitalVetri WMS',
      text: [
        `Hi ${fullName},`,
        '',
        'An admin has set up your DV-WMS account. Click the link below to choose a password and finish signing in:',
        '',
        inviteUrl,
        '',
        `This invite expires in ${INVITE_TTL_DAYS} days.`,
        '',
        '— DV-WMS',
      ].join('\n'),
    });
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, status: true, memberships: { select: { team_id: true } } },
    });
    if (!target) throw new NotFoundException('User not found');

    const isAdmin = actor.role === Role.super_admin;
    const isSelf = actor.id === id;
    const isLeaderOfTarget =
      actor.role === Role.team_leader &&
      target.memberships.some((m) => actor.led_team_ids.includes(m.team_id));

    if (!isAdmin && !isSelf && !isLeaderOfTarget) {
      throw new ForbiddenException('Cannot edit this user');
    }

    // Self-service: limited fields only (phone, photo, WhatsApp opt-in).
    if (!isAdmin && isSelf) {
      const allowed: Prisma.UserUpdateInput = {};
      if (dto.phone !== undefined) allowed.phone = dto.phone;
      if (dto.photo_url !== undefined) allowed.photo_url = dto.photo_url;
      if (dto.whatsapp_enabled !== undefined) allowed.whatsapp_enabled = dto.whatsapp_enabled;
      return this.prisma.user.update({ where: { id }, data: allowed, select: USER_PUBLIC_SELECT });
    }

    // Leader editing a team member: limited to internship metadata.
    if (!isAdmin && isLeaderOfTarget) {
      const allowed: Prisma.UserUpdateInput = {};
      if (dto.internship_role !== undefined) allowed.internship_role = dto.internship_role;
      if (dto.department !== undefined) allowed.department = dto.department;
      return this.prisma.user.update({ where: { id }, data: allowed, select: USER_PUBLIC_SELECT });
    }

    // Admin: every field.
    return this.prisma.user.update({
      where: { id },
      data: {
        full_name: dto.full_name ?? undefined,
        phone: dto.phone ?? undefined,
        whatsapp_enabled: dto.whatsapp_enabled ?? undefined,
        photo_url: dto.photo_url ?? undefined,
        college: dto.college ?? undefined,
        degree: dto.degree ?? undefined,
        year_of_study: dto.year_of_study ?? undefined,
        department: dto.department ?? undefined,
        internship_role: dto.internship_role ?? undefined,
        status: dto.status ?? undefined,
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  async deactivate(actor: AuthenticatedUser, id: string) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can deactivate users');
    }
    if (actor.id === id) {
      throw new BadRequestException('Cannot deactivate your own account');
    }
    return this.prisma.user.update({
      where: { id },
      data: { status: 'inactive' },
      select: USER_PUBLIC_SELECT,
    });
  }

  async summary(actor: AuthenticatedUser, id: string) {
    if (actor.role !== Role.super_admin && actor.id !== id) {
      throw new ForbiddenException('Cannot view this user summary');
    }
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        full_name: true,
        joining_date: true,
        memberships: { select: { team: { select: { id: true, name: true } } } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const [tasksCompleted, leadsConverted, projectsContributed] = await Promise.all([
      this.prisma.task.count({ where: { assignee_id: id, status: 'completed' } }),
      this.prisma.lead.count({ where: { assigned_to: id, status: 'converted' } }),
      this.prisma.project.count({
        where: { tasks: { some: { assignee_id: id } } },
      }),
    ]);

    return {
      user_id: user.id,
      full_name: user.full_name,
      joining_date: user.joining_date,
      teams: user.memberships.map((m) => m.team),
      tasks_completed: tasksCompleted,
      leads_converted: leadsConverted,
      projects_contributed: projectsContributed,
      // Filled in once PerformanceModule ships:
      avg_score: null,
    };
  }
}

function generateTempPassword(): string {
  // 12 chars, base64url, easy to copy and well above 8-char minimum.
  return randomBytes(9).toString('base64url');
}

function generateInviteToken(): string {
  // 256 bits of entropy, base64url-encoded. URL-safe and infeasible to guess.
  return randomBytes(32).toString('base64url');
}

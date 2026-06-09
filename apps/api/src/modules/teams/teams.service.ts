import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { canManageTeam, teamScopeWhere } from '../../common/utils/scope';
import { PrismaService } from '../../prisma/prisma.service';
import type { AddTeamMemberDto } from './dto/add-member.dto';
import type { AssignLeaderDto } from './dto/assign-leader.dto';
import type { CreateTeamDto } from './dto/create-team.dto';
import type { UpdateTeamDto } from './dto/update-team.dto';

const TEAM_PUBLIC_SELECT = {
  id: true,
  name: true,
  description: true,
  category: true,
  leader_id: true,
  is_active: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.TeamSelect;

@Injectable()
export class TeamsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(actor: AuthenticatedUser) {
    const teams = await this.prisma.team.findMany({
      where: teamScopeWhere(actor),
      select: {
        ...TEAM_PUBLIC_SELECT,
        leader: { select: { id: true, full_name: true, email: true } },
        _count: { select: { members: true, projects: true } },
      },
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
    });
    return teams;
  }

  async getOne(actor: AuthenticatedUser, id: string) {
    const team = await this.prisma.team.findFirst({
      where: { AND: [{ id }, teamScopeWhere(actor)] },
      select: {
        ...TEAM_PUBLIC_SELECT,
        leader: { select: { id: true, full_name: true, email: true, photo_url: true } },
        members: {
          select: {
            id: true,
            is_primary: true,
            joined_at: true,
            user: {
              select: {
                id: true,
                full_name: true,
                email: true,
                role: true,
                status: true,
                photo_url: true,
                internship_role: true,
              },
            },
          },
          orderBy: [{ is_primary: 'desc' }, { joined_at: 'asc' }],
        },
        _count: { select: { projects: true } },
      },
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  async create(actor: AuthenticatedUser, dto: CreateTeamDto) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can create teams');
    }
    if (dto.leader_id) {
      await this.assertLeaderEligible(dto.leader_id);
    }
    try {
      return await this.prisma.team.create({
        data: {
          name: dto.name,
          description: dto.description ?? null,
          category: dto.category ?? null,
          leader_id: dto.leader_id ?? null,
        },
        select: TEAM_PUBLIC_SELECT,
      });
    } catch (e) {
      if (isUniqueViolation(e, 'teams_name_key')) {
        throw new ConflictException('A team with that name already exists');
      }
      throw e;
    }
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateTeamDto) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can edit teams');
    }
    await this.requireTeamExists(id);
    try {
      return await this.prisma.team.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description ?? undefined,
          category: dto.category ?? undefined,
          is_active: dto.is_active ?? undefined,
        },
        select: TEAM_PUBLIC_SELECT,
      });
    } catch (e) {
      if (isUniqueViolation(e, 'teams_name_key')) {
        throw new ConflictException('A team with that name already exists');
      }
      throw e;
    }
  }

  async assignLeader(actor: AuthenticatedUser, id: string, dto: AssignLeaderDto) {
    if (actor.role !== Role.super_admin) {
      throw new ForbiddenException('Only the Super Admin can assign team leaders');
    }
    await this.requireTeamExists(id);
    await this.assertLeaderEligible(dto.user_id);
    return this.prisma.team.update({
      where: { id },
      data: { leader_id: dto.user_id },
      select: TEAM_PUBLIC_SELECT,
    });
  }

  async addMember(actor: AuthenticatedUser, id: string, dto: AddTeamMemberDto) {
    if (!canManageTeam(actor, id)) {
      throw new ForbiddenException('Only the Super Admin or the team leader can manage members');
    }
    await this.requireTeamExists(id);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.user_id },
      select: { id: true, status: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (user.status !== 'active') throw new BadRequestException('User is not active');

    try {
      const member = await this.prisma.teamMember.create({
        data: { team_id: id, user_id: dto.user_id, is_primary: dto.is_primary ?? false },
        select: {
          id: true,
          team_id: true,
          user_id: true,
          is_primary: true,
          joined_at: true,
        },
      });
      return member;
    } catch (e) {
      if (isUniqueViolation(e, 'team_members_team_id_user_id_key')) {
        throw new ConflictException('User is already a member of this team');
      }
      throw e;
    }
  }

  async removeMember(actor: AuthenticatedUser, id: string, userId: string) {
    if (!canManageTeam(actor, id)) {
      throw new ForbiddenException('Only the Super Admin or the team leader can manage members');
    }
    const deleted = await this.prisma.teamMember.deleteMany({
      where: { team_id: id, user_id: userId },
    });
    if (deleted.count === 0) throw new NotFoundException('Membership not found');
    return { removed: deleted.count };
  }

  async leaderboard(actor: AuthenticatedUser, id: string) {
    if (!canManageTeam(actor, id) && actor.role !== Role.intern) {
      // Interns can view leaderboards of teams they belong to:
      const isMember = actor.member_team_ids.includes(id);
      if (!isMember) throw new ForbiddenException('Cannot view this team leaderboard');
    }
    // Placeholder until PerformanceModule ships — return members with null scores.
    const members = await this.prisma.teamMember.findMany({
      where: { team_id: id },
      select: { user: { select: { id: true, full_name: true } } },
    });
    return members.map((m, idx) => ({
      rank: idx + 1,
      user_id: m.user.id,
      full_name: m.user.full_name,
      total_score: null,
    }));
  }

  private async requireTeamExists(id: string): Promise<void> {
    const exists = await this.prisma.team.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Team not found');
  }

  private async assertLeaderEligible(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, status: true },
    });
    if (!user) throw new NotFoundException('Proposed leader does not exist');
    if (user.status !== 'active') throw new BadRequestException('Proposed leader is not active');
    if (user.role !== Role.team_leader && user.role !== Role.super_admin) {
      throw new BadRequestException('User does not have the team_leader role');
    }
  }
}

function isUniqueViolation(e: unknown, _constraint: string): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

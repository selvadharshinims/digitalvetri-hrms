import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AddTeamMemberDto } from './dto/add-member.dto';
import { AssignLeaderDto } from './dto/assign-leader.dto';
import { CreateTeamDto } from './dto/create-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { TeamsService } from './teams.service';

@ApiBearerAuth()
@ApiTags('teams')
@Controller('teams')
export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  @Get()
  @ApiOperation({ summary: 'List teams (scoped)' })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.teams.list(user);
  }

  @Post()
  @Roles(Role.super_admin)
  @ApiOperation({ summary: 'Create a team (Admin)' })
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTeamDto) {
    return this.teams.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get team detail (scoped)' })
  getOne(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.teams.getOne(actor, id);
  }

  @Patch(':id')
  @Roles(Role.super_admin)
  @ApiOperation({ summary: 'Update team (Admin)' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTeamDto,
  ) {
    return this.teams.update(actor, id, dto);
  }

  @Post(':id/leader')
  @Roles(Role.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign team leader (Admin)' })
  assignLeader(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignLeaderDto,
  ) {
    return this.teams.assignLeader(actor, id, dto);
  }

  @Post(':id/members')
  @ApiOperation({ summary: 'Add a team member (Admin or team leader)' })
  addMember(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddTeamMemberDto,
  ) {
    return this.teams.addMember(actor, id, dto);
  }

  @Delete(':id/members/:userId')
  @ApiOperation({ summary: 'Remove a team member (Admin or team leader)' })
  removeMember(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.teams.removeMember(actor, id, userId);
  }

  @Get(':id/leaderboard')
  @ApiOperation({ summary: 'Team leaderboard (placeholder until performance ships)' })
  leaderboard(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.teams.leaderboard(actor, id);
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { BulkDeleteLeadsDto } from './dto/bulk-delete-leads.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { ListLeadsDto } from './dto/list-leads.dto';
import { ScoreLeadsDto } from './dto/score-leads.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { UpdateLeadStatusDto } from './dto/update-status.dto';
import { LeadsService } from './leads.service';

@ApiBearerAuth()
@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'List leads (scoped)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListLeadsDto) {
    return this.leads.list(user, query);
  }

  @Get('funnel')
  @ApiOperation({ summary: 'Counts per status (scoped) — feeds dashboards' })
  funnel(@CurrentUser() user: AuthenticatedUser) {
    return this.leads.funnel(user);
  }

  @Get('stale')
  @ApiOperation({ summary: 'Leads with no activity > N days' })
  stale(
    @CurrentUser() user: AuthenticatedUser,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ) {
    return this.leads.stale(user, days);
  }

  @Post()
  @ApiOperation({ summary: 'Create a single lead (Admin or Leader)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateLeadDto) {
    return this.leads.create(user, dto);
  }

  @Post('import')
  @ApiOperation({ summary: 'Bulk import — dedupes on phone/email' })
  import(@CurrentUser() user: AuthenticatedUser, @Body() dto: ImportLeadsDto) {
    return this.leads.importMany(user, dto);
  }

  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.super_admin)
  @ApiOperation({ summary: 'Hard-delete a batch of leads (admin only)' })
  bulkDelete(@Body() dto: BulkDeleteLeadsDto) {
    return this.leads.bulkDelete(dto.ids);
  }

  @Post('score')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI-score open leads (admin/leader; defaults to top-30 in-scope open leads; 503 if ANTHROPIC_API_KEY unset)',
  })
  score(@CurrentUser() user: AuthenticatedUser, @Body() dto: ScoreLeadsDto) {
    return this.leads.scoreLeads(user, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.leads.getOne(user, id);
  }

  @Get(':id/activities')
  activities(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.leads.getActivities(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update lead fields (not status)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(user, id, dto);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Assign / reassign a lead' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignLeadDto,
  ) {
    return this.leads.assign(user, id, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change lead status — logs to the activity timeline' })
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLeadStatusDto,
  ) {
    return this.leads.changeStatus(user, id, dto);
  }
}

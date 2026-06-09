import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { csvFilename, toCsv, type CsvColumn } from '../../common/utils/csv';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiBearerAuth()
@ApiTags('reports')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('team-performance')
  @ApiOperation({ summary: 'Per-team rollup: avg score, leads, tasks, attendance' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async teamPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.teamPerformance(user, query);
    if (query.format !== 'csv') return result;
    return sendCsv(res, 'team-performance', TEAM_PERFORMANCE_COLUMNS, result.data);
  }

  @Get('lead-performance')
  @ApiOperation({ summary: 'Per-intern lead pipeline + conversion + value' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async leadPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.leadPerformance(user, query);
    if (query.format !== 'csv') return result;
    return sendCsv(res, 'lead-performance', LEAD_PERFORMANCE_COLUMNS, result.data);
  }

  @Get('attendance')
  @ApiOperation({ summary: 'Per-user attendance counts and %' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async attendance(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.attendance(user, query);
    if (query.format !== 'csv') return result;
    return sendCsv(res, 'attendance', ATTENDANCE_COLUMNS, result.data);
  }

  @Get('project-progress')
  @ApiOperation({ summary: 'Per-project progress + deadline risk' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async projectProgress(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.projectProgress(user, query);
    if (query.format !== 'csv') return result;
    return sendCsv(res, 'project-progress', PROJECT_PROGRESS_COLUMNS, result.data);
  }

  @Get('intern-rankings')
  @ApiOperation({ summary: 'Leaderboard with full per-factor breakdown' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async internRankings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.internRankings(user, query);
    if (query.format !== 'csv') return result;
    return sendCsv(res, 'intern-rankings', INTERN_RANKINGS_COLUMNS, result.data);
  }

  @Get('conversion')
  @ApiOperation({ summary: 'Funnel counts + per-source conversion + deal value' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'] })
  async conversion(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ReportQueryDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.reports.conversion(user, query);
    if (query.format !== 'csv') return result;
    // The conversion report has a single row but a tabular by_source array;
    // for CSV we emit the per-source breakdown, which is what management wants
    // for spreadsheet analysis.
    return sendCsv(res, 'conversion', CONVERSION_COLUMNS, result.data[0]?.by_source ?? []);
  }
}

function sendCsv<T>(
  res: Response,
  name: string,
  columns: CsvColumn<T>[],
  rows: T[],
): string {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${csvFilename(name)}"`,
  );
  return toCsv(columns, rows);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV column definitions per report — kept here so the controller is the
// single source of truth for both the JSON shape and its CSV serialization.
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_PERFORMANCE_COLUMNS: CsvColumn<{
  team_name: string;
  member_count: number;
  avg_score: number;
  leads_generated: number;
  leads_converted: number;
  conversion_rate_pct: number;
  tasks_completed: number;
  attendance_avg_pct: number;
}>[] = [
  { header: 'Team', get: (r) => r.team_name },
  { header: 'Members', get: (r) => r.member_count },
  { header: 'Avg score', get: (r) => r.avg_score },
  { header: 'Leads generated', get: (r) => r.leads_generated },
  { header: 'Leads converted', get: (r) => r.leads_converted },
  { header: 'Conversion %', get: (r) => r.conversion_rate_pct },
  { header: 'Tasks completed', get: (r) => r.tasks_completed },
  { header: 'Attendance %', get: (r) => r.attendance_avg_pct },
];

const LEAD_PERFORMANCE_COLUMNS: CsvColumn<{
  full_name: string;
  team_names: string[];
  leads_assigned: number;
  leads_worked: number;
  leads_converted: number;
  conversion_rate_pct: number;
  total_deal_value: number;
}>[] = [
  { header: 'Person', get: (r) => r.full_name },
  { header: 'Teams', get: (r) => r.team_names.join('; ') },
  { header: 'Assigned', get: (r) => r.leads_assigned },
  { header: 'Worked', get: (r) => r.leads_worked },
  { header: 'Converted', get: (r) => r.leads_converted },
  { header: 'Conversion %', get: (r) => r.conversion_rate_pct },
  { header: 'Total deal value', get: (r) => r.total_deal_value },
];

const ATTENDANCE_COLUMNS: CsvColumn<{
  full_name: string;
  working_days: number;
  present: number;
  late: number;
  half_day: number;
  leave: number;
  absent: number;
  attendance_pct: number;
}>[] = [
  { header: 'Person', get: (r) => r.full_name },
  { header: 'Working days', get: (r) => r.working_days },
  { header: 'Present', get: (r) => r.present },
  { header: 'Late', get: (r) => r.late },
  { header: 'Half day', get: (r) => r.half_day },
  { header: 'Leave', get: (r) => r.leave },
  { header: 'Absent', get: (r) => r.absent },
  { header: 'Attendance %', get: (r) => r.attendance_pct },
];

const PROJECT_PROGRESS_COLUMNS: CsvColumn<{
  project_name: string;
  team_name: string | null;
  client_name: string | null;
  status: string;
  progress_pct: number;
  derived_progress_pct: number;
  deliverables_done: number;
  deliverables_total: number;
  tasks_completed: number;
  tasks_total: number;
  deadline: string | null;
  deadline_risk: string;
}>[] = [
  { header: 'Project', get: (r) => r.project_name },
  { header: 'Team', get: (r) => r.team_name ?? '' },
  { header: 'Client', get: (r) => r.client_name ?? '' },
  { header: 'Status', get: (r) => r.status },
  { header: 'Progress %', get: (r) => r.progress_pct },
  { header: 'Derived %', get: (r) => r.derived_progress_pct },
  { header: 'Deliverables', get: (r) => `${r.deliverables_done}/${r.deliverables_total}` },
  { header: 'Tasks', get: (r) => `${r.tasks_completed}/${r.tasks_total}` },
  { header: 'Deadline', get: (r) => r.deadline ?? '' },
  { header: 'Risk', get: (r) => r.deadline_risk },
];

const INTERN_RANKINGS_COLUMNS: CsvColumn<{
  rank: number;
  full_name: string;
  team_names: string[];
  total_score: number;
  band: string;
  attendance_score: number;
  task_score: number;
  lead_score: number;
  project_score: number;
  feedback_score: number;
  discipline_score: number;
}>[] = [
  { header: 'Rank', get: (r) => r.rank },
  { header: 'Person', get: (r) => r.full_name },
  { header: 'Teams', get: (r) => r.team_names.join('; ') },
  { header: 'Total', get: (r) => r.total_score },
  { header: 'Band', get: (r) => r.band },
  { header: 'Attendance', get: (r) => r.attendance_score },
  { header: 'Tasks', get: (r) => r.task_score },
  { header: 'Leads', get: (r) => r.lead_score },
  { header: 'Project', get: (r) => r.project_score },
  { header: 'Feedback', get: (r) => r.feedback_score },
  { header: 'Discipline', get: (r) => r.discipline_score },
];

const CONVERSION_COLUMNS: CsvColumn<{
  source: string;
  worked: number;
  converted: number;
  conversion_rate_pct: number;
  total_value: number;
}>[] = [
  { header: 'Source', get: (r) => r.source },
  { header: 'Worked', get: (r) => r.worked },
  { header: 'Converted', get: (r) => r.converted },
  { header: 'Conversion %', get: (r) => r.conversion_rate_pct },
  { header: 'Total value', get: (r) => r.total_value },
];

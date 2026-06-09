import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DailyReportsService } from './daily-reports.service';
import { DigestQueryDto } from './dto/digest.dto';
import {
  ListDailyReportsDto,
  MissingReportsDto,
} from './dto/list-reports.dto';
import { ReviewDailyReportDto } from './dto/review-report.dto';
import { SubmitDailyReportDto } from './dto/submit-report.dto';

@ApiBearerAuth()
@ApiTags('daily-reports')
@Controller('daily-reports')
export class DailyReportsController {
  constructor(private readonly reports: DailyReportsService) {}

  @Get()
  @ApiOperation({ summary: 'List daily reports (scoped)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDailyReportsDto) {
    return this.reports.list(user, query);
  }

  @Get('mine')
  @ApiOperation({ summary: 'My report for a given date (defaults to today)' })
  mine(@CurrentUser() user: AuthenticatedUser, @Query('date') date?: string) {
    return this.reports.getMine(user, date);
  }

  @Get('missing')
  @ApiOperation({ summary: 'Users missing a daily report in the past N days' })
  missing(@CurrentUser() user: AuthenticatedUser, @Query() query: MissingReportsDto) {
    return this.reports.missing(user, query);
  }

  @Post('digest')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI-generated digest of daily reports in a window (admin/leader; 503 if ANTHROPIC_API_KEY unset)',
  })
  digest(@CurrentUser() user: AuthenticatedUser, @Query() query: DigestQueryDto) {
    return this.reports.generateDigest(user, query);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit or update today’s daily report' })
  submit(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitDailyReportDto) {
    return this.reports.submit(user, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.reports.getOne(user, id);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leader/admin: acknowledge or leave feedback' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewDailyReportDto,
  ) {
    return this.reports.review(user, id, dto);
  }
}

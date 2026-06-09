import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AttendanceService } from './attendance.service';
import {
  AttendanceReportDto,
  ListAttendanceDto,
} from './dto/list-attendance.dto';
import { MarkAttendanceDto } from './dto/mark-attendance.dto';

@ApiBearerAuth()
@ApiTags('attendance')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get()
  @ApiOperation({ summary: 'List attendance rows (scoped)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListAttendanceDto) {
    return this.attendance.list(user, query);
  }

  @Get('today')
  @ApiOperation({ summary: 'Today snapshot per visible user (leader/admin)' })
  today(@CurrentUser() user: AuthenticatedUser, @Query('team_id') team_id?: string) {
    return this.attendance.todaySnapshot(user, team_id);
  }

  @Get('report')
  @ApiOperation({ summary: 'Monthly per-user summary with attendance %' })
  report(@CurrentUser() user: AuthenticatedUser, @Query() query: AttendanceReportDto) {
    return this.attendance.monthlyReport(user, query);
  }

  @Post('check-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Self check-in (stamps now; status = present or late)' })
  checkIn(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.checkIn(user);
  }

  @Post('check-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Self check-out (stamps now on today’s row)' })
  checkOut(@CurrentUser() user: AuthenticatedUser) {
    return this.attendance.checkOut(user);
  }

  @Post('mark')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leader/admin: mark or override a user’s attendance' })
  mark(@CurrentUser() user: AuthenticatedUser, @Body() dto: MarkAttendanceDto) {
    return this.attendance.mark(user, dto);
  }
}

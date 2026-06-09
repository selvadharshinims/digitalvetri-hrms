import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { DashboardService } from './dashboard.service';
import { TeamInsightsDto } from './dto/team-insights.dto';

@ApiBearerAuth()
@ApiTags('dashboard')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({
    summary: 'Role-adaptive dashboard payload (owner / leader / intern)',
  })
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboard.forUser(user);
  }

  @Post('team-insights')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI-generated cross-team productivity narrative (admin/leader; 503 if ANTHROPIC_API_KEY unset)',
  })
  teamInsights(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: TeamInsightsDto,
  ) {
    return this.dashboard.generateTeamInsights(user, dto.days ?? 7);
  }
}

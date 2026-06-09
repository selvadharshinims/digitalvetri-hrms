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
import { GetScoreDto } from './dto/get-score.dto';
import { LeaderboardDto } from './dto/leaderboard.dto';
import { SubmitFeedbackDto } from './dto/submit-feedback.dto';
import { PerformanceService } from './performance.service';

@ApiBearerAuth()
@ApiTags('performance')
@Controller('performance')
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('me')
  @ApiOperation({ summary: 'Current score for the signed-in user' })
  me(@CurrentUser() user: AuthenticatedUser, @Query() query: GetScoreDto) {
    return this.performance.getScore(user, user.id, query);
  }

  @Get('me/history')
  @ApiOperation({ summary: 'Score history for the signed-in user' })
  myHistory(@CurrentUser() user: AuthenticatedUser) {
    return this.performance.listMyHistory(user, user.id);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Leaderboard, optionally scoped to a team' })
  leaderboard(@CurrentUser() user: AuthenticatedUser, @Query() query: LeaderboardDto) {
    return this.performance.leaderboard(user, query);
  }

  @Post('feedback')
  @ApiOperation({ summary: 'Leader/admin: rate quality/ownership/collaboration (1-5)' })
  feedback(@CurrentUser() user: AuthenticatedUser, @Body() dto: SubmitFeedbackDto) {
    return this.performance.submitFeedback(user, dto);
  }

  @Post('recompute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: trigger an org-wide recompute' })
  recompute(@CurrentUser() user: AuthenticatedUser) {
    return this.performance.recomputeAll(user);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Score for a specific user (scoped)' })
  byUser(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Query() query: GetScoreDto,
  ) {
    return this.performance.getScore(user, userId, query);
  }

  @Get(':userId/history')
  history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.performance.listMyHistory(user, userId);
  }

  @Post(':userId/ai-analysis')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI-generated narrative analysis (Claude). Returns 503 if ANTHROPIC_API_KEY is unset.',
  })
  aiAnalysis(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.performance.generateAiAnalysis(user, userId);
  }

  @Get(':userId/feedback')
  feedbackList(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.performance.listFeedback(user, userId);
  }
}

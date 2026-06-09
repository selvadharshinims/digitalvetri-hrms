import { Global, Module } from '@nestjs/common';
import { AiQueryController } from './ai-query.controller';
import { AnthropicService } from './anthropic.service';
import { ConversationalQueryService } from './conversational-query.service';
import { DailyReportDigestService } from './daily-report-digest.service';
import { LeadScoringService } from './lead-scoring.service';
import { PerformanceNarrativeService } from './performance-narrative.service';
import { ProjectRiskService } from './project-risk.service';
import { TeamProductivityService } from './team-productivity.service';

/**
 * Global so any domain module can inject AI services without adding AiModule
 * to its imports list. The conversational-query controller lives here too
 * since it doesn't fit any single domain.
 */
@Global()
@Module({
  controllers: [AiQueryController],
  providers: [
    AnthropicService,
    PerformanceNarrativeService,
    DailyReportDigestService,
    LeadScoringService,
    ProjectRiskService,
    TeamProductivityService,
    ConversationalQueryService,
  ],
  exports: [
    AnthropicService,
    PerformanceNarrativeService,
    DailyReportDigestService,
    LeadScoringService,
    ProjectRiskService,
    TeamProductivityService,
    ConversationalQueryService,
  ],
})
export class AiModule {}

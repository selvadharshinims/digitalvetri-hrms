import { Module } from '@nestjs/common';
import { PerformanceModule } from '../performance/performance.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [PerformanceModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

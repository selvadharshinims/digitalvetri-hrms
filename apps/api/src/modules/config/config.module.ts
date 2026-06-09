import { Module } from '@nestjs/common';
import { ConfigController } from './config.controller';
import { ConfigService as DvConfigService } from './config.service';

@Module({
  controllers: [ConfigController],
  providers: [DvConfigService],
  exports: [DvConfigService],
})
export class DvConfigModule {}

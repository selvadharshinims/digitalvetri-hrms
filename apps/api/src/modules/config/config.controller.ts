import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConfigService as DvConfigService } from './config.service';
import { UpdateScoringConfigDto } from './dto/update-scoring-config.dto';

@ApiBearerAuth()
@ApiTags('config')
@Controller('config')
export class ConfigController {
  constructor(private readonly config: DvConfigService) {}

  @Get('scoring')
  @ApiOperation({ summary: 'Read current scoring configuration (weights + thresholds)' })
  getScoring() {
    return this.config.getScoring();
  }

  @Patch('scoring')
  @ApiOperation({ summary: 'Update scoring configuration (Admin)' })
  updateScoring(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateScoringConfigDto,
  ) {
    return this.config.updateScoring(user, dto);
  }
}

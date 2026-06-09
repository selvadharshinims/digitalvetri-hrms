import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { ConversationalQueryService } from './conversational-query.service';
import { AskQueryDto } from './dto/ask-query.dto';

@ApiBearerAuth()
@ApiTags('ai')
@Controller('ai')
export class AiQueryController {
  constructor(private readonly query: ConversationalQueryService) {}

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Conversational query over DV-WMS data (admin/leader; 503 if ANTHROPIC_API_KEY unset)',
  })
  ask(@CurrentUser() user: AuthenticatedUser, @Body() dto: AskQueryDto) {
    if (user.role === Role.intern) {
      throw new ForbiddenException(
        'Conversational query is restricted to leaders and admins',
      );
    }
    return this.query.ask(user, dto.messages);
  }
}

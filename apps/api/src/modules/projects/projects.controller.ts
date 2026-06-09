import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { AssessProjectRisksDto } from './dto/assess-risk.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import {
  CreateDeliverableDto,
  UpdateDeliverableDto,
} from './dto/deliverable.dto';
import { ListProjectsDto } from './dto/list-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ProjectsService } from './projects.service';

@ApiBearerAuth()
@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: 'List projects (scoped)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListProjectsDto) {
    return this.projects.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create project (Admin)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateProjectDto) {
    return this.projects.create(user, dto);
  }

  @Post('assess-risk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI-assess delivery risk (admin/leader; defaults to in-scope non-terminal projects, max 20; 503 if ANTHROPIC_API_KEY unset)',
  })
  assessRisk(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssessProjectRisksDto,
  ) {
    return this.projects.assessRisks(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Project detail with deliverables and linked tasks' })
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.projects.getOne(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project (Admin or Leader of team)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projects.update(user, id, dto);
  }

  @Post(':id/sync-progress')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Copy derived progress (deliverables + tasks) into stored progress_pct' })
  sync(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.projects.syncProgress(user, id);
  }

  @Get(':id/deliverables')
  listDeliverables(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.projects.listDeliverables(user, id);
  }

  @Post(':id/deliverables')
  addDeliverable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CreateDeliverableDto,
  ) {
    return this.projects.addDeliverable(user, id, dto);
  }

  @Patch(':id/deliverables/:deliverableId')
  updateDeliverable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('deliverableId', new ParseUUIDPipe()) deliverableId: string,
    @Body() dto: UpdateDeliverableDto,
  ) {
    return this.projects.updateDeliverable(user, id, deliverableId, dto);
  }

  @Delete(':id/deliverables/:deliverableId')
  removeDeliverable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('deliverableId', new ParseUUIDPipe()) deliverableId: string,
  ) {
    return this.projects.removeDeliverable(user, id, deliverableId);
  }
}

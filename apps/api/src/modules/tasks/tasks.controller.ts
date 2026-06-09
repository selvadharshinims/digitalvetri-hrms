import {
  Body,
  Controller,
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
import { CommentTaskDto } from './dto/comment-task.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { ListTasksDto } from './dto/list-tasks.dto';
import { ReviewTaskDto } from './dto/review-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiBearerAuth()
@ApiTags('tasks')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'List tasks (scoped)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTasksDto) {
    return this.tasks.list(user, query);
  }

  @Get('mine')
  @ApiOperation({ summary: 'Open tasks assigned to me (cross-team)' })
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.tasks.mine(user);
  }

  @Get('board')
  @ApiOperation({ summary: 'Tasks grouped by status (Kanban)' })
  board(
    @CurrentUser() user: AuthenticatedUser,
    @Query('project_id') project_id?: string,
    @Query('team_id') team_id?: string,
  ) {
    return this.tasks.board(user, { project_id, team_id });
  }

  @Post()
  @ApiOperation({ summary: 'Create task (Admin or Leader)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user, dto);
  }

  @Get(':id')
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.getOne(user, id);
  }

  @Get(':id/activities')
  activities(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.tasks.getActivities(user, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update task fields, status (except via review), and progress' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.tasks.update(user, id, dto);
  }

  @Post(':id/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Approve (→ completed) or reopen (→ in_progress)' })
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewTaskDto,
  ) {
    return this.tasks.review(user, id, dto);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Append a comment to the task activity log' })
  comment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CommentTaskDto,
  ) {
    return this.tasks.comment(user, id, dto);
  }
}

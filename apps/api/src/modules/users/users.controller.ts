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
import { Role } from '@prisma/client';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiBearerAuth()
@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List users (scoped by role)' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListUsersDto) {
    return this.users.list(user, query);
  }

  @Post()
  @Roles(Role.super_admin)
  @ApiOperation({ summary: 'Create a user account (Admin)' })
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single user (scoped)' })
  getOne(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.getOne(actor, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user (admin all fields; self/leader limited)' })
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  @Post(':id/deactivate')
  @Roles(Role.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft-deactivate user (Admin)' })
  deactivate(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.deactivate(actor, id);
  }

  @Post(':id/invite')
  @Roles(Role.super_admin)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-issue invite token + resend invite email (Admin)' })
  invite(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.invite(actor, id);
  }

  @Get(':id/summary')
  @ApiOperation({ summary: 'Internship summary (Admin or self)' })
  summary(@CurrentUser() actor: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.users.summary(actor, id);
  }
}

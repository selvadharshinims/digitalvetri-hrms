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
import { AssignTicketDto } from './dto/assign-ticket.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ListTicketsDto } from './dto/list-tickets.dto';
import { SendTicketMessageDto } from './dto/send-message.dto';
import { UpdateTicketStatusDto } from './dto/update-status.dto';
import { TicketsService } from './tickets.service';

@ApiBearerAuth()
@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get()
  @ApiOperation({ summary: 'List tickets (scoped); supports unattended/mine flags' })
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListTicketsDto) {
    return this.tickets.list(user, query);
  }

  @Post()
  @ApiOperation({ summary: 'Raise a new ticket (anyone)' })
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTicketDto) {
    return this.tickets.create(user, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Ticket detail with thread' })
  getOne(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.tickets.getOne(user, id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Post a message — visible to ticket participants' })
  postMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SendTicketMessageDto,
  ) {
    return this.tickets.postMessage(user, id, dto);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Change status — logged as a message' })
  changeStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateTicketStatusDto,
  ) {
    return this.tickets.changeStatus(user, id, dto);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reassign (admin or team leader)' })
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AssignTicketDto,
  ) {
    return this.tickets.assign(user, id, dto);
  }
}

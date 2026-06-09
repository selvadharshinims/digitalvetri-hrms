import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, type AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SetPasswordDto } from './dto/set-password.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Email + password → access/refresh tokens' })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Rotate refresh token; old token is denylisted' })
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refresh_token);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalidate refresh token' })
  async logout(@Body() dto: RefreshDto) {
    await this.auth.logout(dto.refresh_token);
  }

  @Public()
  @Post('set-password')
  @ApiOperation({ summary: 'First-login / invite-token password setup' })
  setPassword(@Body() dto: SetPasswordDto) {
    return this.auth.setPassword(dto.invite_token, dto.new_password);
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Current user + role + team scopes' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return user;
  }
}

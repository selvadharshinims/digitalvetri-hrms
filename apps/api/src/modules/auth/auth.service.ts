import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { AccessTokenPayload } from './jwt.strategy';

interface RefreshTokenPayload {
  sub: string;
  jti: string;
  type: 'refresh';
  iat?: number;
  exp?: number;
}

export interface IssueResult {
  access_token: string;
  refresh_token: string;
  access_token_expires_in: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        full_name: true,
        password_hash: true,
        role: true,
        status: true,
        led_teams: { select: { id: true } },
        memberships: { select: { team_id: true } },
      },
    });

    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await argon2.verify(user.password_hash, password).catch(() => false);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    const tokens = await this.issueTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        led_team_ids: user.led_teams.map((t) => t.id),
        member_team_ids: user.memberships.map((m) => m.team_id),
      },
      tokens,
    };
  }

  async refresh(refreshToken: string): Promise<IssueResult> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Wrong token type');
    }

    const denylisted = await this.redis.isRefreshDenylisted(payload.jti);
    if (denylisted) throw new UnauthorizedException('Refresh token revoked');

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, status: true },
    });
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('User inactive');
    }

    // Rotate: invalidate the old refresh, issue a fresh pair.
    const remainingTtl = payload.exp ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 1) : 60;
    await this.redis.denylistRefresh(payload.jti, remainingTtl);

    return this.issueTokens(user.id, user.email);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const remainingTtl = payload.exp
        ? Math.max(payload.exp - Math.floor(Date.now() / 1000), 1)
        : 60;
      await this.redis.denylistRefresh(payload.jti, remainingTtl);
    } catch {
      // Silent — logout should always 204 even for already-invalid tokens.
    }
  }

  /**
   * Consume an invite token: hash the new password into the matching user,
   * clear the token, and issue a fresh login session so the user lands
   * straight in the app after submitting.
   */
  async setPassword(inviteToken: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { invite_token: inviteToken },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        status: true,
        invite_token_expires_at: true,
        led_teams: { select: { id: true } },
        memberships: { select: { team_id: true } },
      },
    });
    if (!user) throw new BadRequestException('Invalid or already-used invite');
    if (user.status !== 'active') throw new BadRequestException('Account is inactive');
    if (user.invite_token_expires_at && user.invite_token_expires_at.getTime() < Date.now()) {
      throw new BadRequestException('Invite has expired — ask an admin to resend');
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: passwordHash,
        invite_token: null,
        invite_token_expires_at: null,
      },
    });

    const tokens = await this.issueTokens(user.id, user.email);
    return {
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        led_team_ids: user.led_teams.map((t) => t.id),
        member_team_ids: user.memberships.map((m) => m.team_id),
      },
      tokens,
    };
  }

  private async issueTokens(userId: string, email: string): Promise<IssueResult> {
    const accessTtl = this.config.get<string>('JWT_ACCESS_TTL', '15m');
    const refreshTtl = this.config.get<string>('JWT_REFRESH_TTL', '7d');
    const accessSecret = this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
    const refreshSecret = this.config.getOrThrow<string>('JWT_REFRESH_SECRET');

    const accessPayload: AccessTokenPayload = { sub: userId, email, type: 'access' };
    const refreshPayload: RefreshTokenPayload = {
      sub: userId,
      jti: randomUUID(),
      type: 'refresh',
    };

    const [access_token, refresh_token] = await Promise.all([
      this.jwt.signAsync(accessPayload, { secret: accessSecret, expiresIn: accessTtl }),
      this.jwt.signAsync(refreshPayload, { secret: refreshSecret, expiresIn: refreshTtl }),
    ]);

    return {
      access_token,
      refresh_token,
      access_token_expires_in: parseDurationToSeconds(accessTtl),
    };
  }
}

function parseDurationToSeconds(d: string): number {
  const m = d.match(/^(\d+)([smhd])$/);
  if (!m) return 900;
  const n = Number(m[1]);
  switch (m[2]) {
    case 's':
      return n;
    case 'm':
      return n * 60;
    case 'h':
      return n * 3600;
    case 'd':
      return n * 86400;
    default:
      return 900;
  }
}

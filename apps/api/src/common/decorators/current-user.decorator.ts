import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  /** Team IDs the user leads (empty for interns). */
  led_team_ids: string[];
  /** Team IDs the user belongs to. */
  member_team_ids: string[];
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext): AuthenticatedUser | unknown => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return data ? request.user?.[data] : request.user;
  },
);

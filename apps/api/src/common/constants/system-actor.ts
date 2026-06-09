import { Role } from '@prisma/client';
import type { AuthenticatedUser } from '../decorators/current-user.decorator';

/**
 * Synthetic actor used by scheduled jobs that need to call actor-scoped
 * service methods on behalf of the whole org. Has `super_admin` role so it
 * passes every scope check and never gets filtered out by `*ScopeWhere`.
 *
 * The UUID is the all-zeros sentinel — no real user row will ever match it.
 * Services that look the actor up in the DB (rare) should treat this UUID
 * as "system" and short-circuit appropriately.
 */
export const SYSTEM_ACTOR: AuthenticatedUser = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'system@dv-wms.internal',
  role: Role.super_admin,
  led_team_ids: [],
  member_team_ids: [],
};

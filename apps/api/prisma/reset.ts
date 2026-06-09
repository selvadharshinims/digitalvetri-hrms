/**
 * Hard reset: truncate every domain table, then recreate just the admin
 * account so you can log back in. Use when you want to move from demo data
 * to real data without rebuilding the schema.
 *
 * Run with: pnpm --filter @dv-wms/api exec ts-node prisma/reset.ts
 *
 * The admin defaults to `admin@digitalvetri.com` / `ChangeMe!123`. Override
 * with env vars:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='Whatever123!' \
 *     pnpm --filter @dv-wms/api exec ts-node prisma/reset.ts
 *
 * The default scoring config row is also recreated (the app depends on
 * `is_active=true` existing somewhere in scoring_configs).
 */
import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.ADMIN_EMAIL ?? 'admin@digitalvetri.com').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'ChangeMe!123';

  console.log('Truncating all domain tables...');
  // TRUNCATE ... CASCADE clears every table at once and resets sequences.
  // `RESTART IDENTITY` resets serial PKs (we use UUIDs but harmless).
  // Tables are quoted to match Prisma's @@map / default naming.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "performance_feedback",
      "performance_scores",
      "ticket_messages",
      "tickets",
      "daily_reports",
      "attendance",
      "task_activities",
      "tasks",
      "project_deliverables",
      "projects",
      "lead_activities",
      "leads",
      "team_members",
      "teams",
      "notifications",
      "users",
      "scoring_config"
    RESTART IDENTITY CASCADE;
  `);
  console.log('  done.');

  console.log(`Recreating admin: ${adminEmail}`);
  const password_hash = await argon2.hash(adminPassword);
  await prisma.user.create({
    data: {
      full_name: 'Super Admin',
      email: adminEmail,
      role: Role.super_admin,
      password_hash,
      status: 'active',
    },
  });

  console.log('Recreating default scoring config (weights from PRD §10.1).');
  await prisma.scoringConfig.create({
    data: {
      is_active: true,
      weights: {
        attendance: 0.15,
        task: 0.25,
        lead: 0.25,
        report: 0.15,
        ticket: 0.1,
        feedback: 0.1,
      },
      stale_lead_days: 3,
      report_cutoff: '19:00',
      work_start_time: '10:00',
      scoring_period_days: 30,
      lead_activity_target: 20,
    },
  });

  console.log('Reset complete.');
  console.log(`  Login: ${adminEmail} / ${adminPassword}`);
}

main()
  .catch((err) => {
    console.error('Reset failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

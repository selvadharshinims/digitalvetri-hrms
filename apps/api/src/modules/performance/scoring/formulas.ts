/**
 * Performance scoring formulas (PRD §10).
 *
 * Pure functions only — no I/O. The PerformanceService gathers domain inputs
 * and passes them in; this keeps the math testable in isolation and lets the
 * UI mirror it later for what-if calculators.
 */

export interface WeightsFraction {
  attendance: number;
  task: number;
  lead: number;
  project: number;
  feedback: number;
  discipline: number;
}

export type FactorKey = keyof WeightsFraction;

/** All component scores are normalized to 0-100. `null` = no data → reweight. */
export interface ComponentScores {
  attendance: number | null;
  task: number | null;
  lead: number | null;
  project: number | null;
  feedback: number | null;
  discipline: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component formulas
// ─────────────────────────────────────────────────────────────────────────────

export interface AttendanceInputs {
  present_days: number;
  half_days: number;
  late_days: number;
  working_days: number;
}

/**
 * A = (present + 0.5 * half) / working * 100
 * Late penalty: -2 per late mark, floored at 0.
 * Returns `null` if no working days in the period.
 */
export function deriveAttendance(i: AttendanceInputs): number | null {
  if (i.working_days <= 0) return null;
  const presentEquivalent = i.present_days + i.late_days + 0.5 * i.half_days;
  const base = (presentEquivalent / i.working_days) * 100;
  const penalized = base - 2 * i.late_days;
  return clamp(penalized, 0, 100);
}

export interface TaskInputs {
  assigned: number;
  completed: number;
  on_time_completed: number;
}

/**
 * base = completed / assigned * 100   (null if assigned = 0 → exclude factor)
 * T = base * (0.7 + 0.3 * (on_time / max(completed, 1)))
 */
export function deriveTask(i: TaskInputs): number | null {
  if (i.assigned <= 0) return null;
  const base = (i.completed / i.assigned) * 100;
  const onTimeRatio = i.completed > 0 ? i.on_time_completed / i.completed : 0;
  const factor = 0.7 + 0.3 * onTimeRatio;
  return clamp(base * factor, 0, 100);
}

export interface LeadInputs {
  worked: number;
  converted: number;
  /** Configurable target of leads worked in the period (default 20). */
  target_worked: number;
}

/**
 * L_raw = (converted / max(worked, 1)) * 100
 * activity_factor = min(worked / target_worked, 1)
 * L = 0.8 * L_raw + 0.2 * activity_factor * 100
 *
 * Returns `null` if neither worked nor converted (factor excluded for non-sales roles).
 */
export function deriveLead(i: LeadInputs): number | null {
  if (i.worked <= 0 && i.converted <= 0) return null;
  const convRate = i.worked > 0 ? i.converted / i.worked : 0;
  const lRaw = convRate * 100;
  const activityFactor = i.target_worked > 0 ? Math.min(i.worked / i.target_worked, 1) : 0;
  return clamp(0.8 * lRaw + 0.2 * activityFactor * 100, 0, 100);
}

export interface ProjectInputs {
  project_tasks_total: number;
  project_tasks_completed: number;
}

/**
 * P = % of the intern's project-linked tasks that are completed.
 * Returns `null` when they have no project work in the period.
 */
export function deriveProject(i: ProjectInputs): number | null {
  if (i.project_tasks_total <= 0) return null;
  return clamp((i.project_tasks_completed / i.project_tasks_total) * 100, 0, 100);
}

export interface FeedbackInputs {
  /** 1-5; averaged across (quality, ownership, collaboration). */
  avg_rating: number | null;
}

/** F = (avg_rating / 5) * 100. Null when no feedback exists. */
export function deriveFeedback(i: FeedbackInputs): number | null {
  if (i.avg_rating === null) return null;
  return clamp((i.avg_rating / 5) * 100, 0, 100);
}

export interface DisciplineInputs {
  reports_submitted: number;
  late_reports: number;
  working_days: number;
}

/**
 * D = (reports_submitted / working_days) * 100
 * Minor penalty: -1 per late report, floored at 0.
 */
export function deriveDiscipline(i: DisciplineInputs): number | null {
  if (i.working_days <= 0) return null;
  const base = (i.reports_submitted / i.working_days) * 100;
  return clamp(base - i.late_reports, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// Composite + reweighting
// ─────────────────────────────────────────────────────────────────────────────

export interface CompositeResult {
  total_score: number;
  components: ComponentScores;
  /** Weights actually applied after reweighting inapplicable factors. */
  effective_weights: WeightsFraction;
  /** Weights as configured (before reweighting). */
  configured_weights: WeightsFraction;
}

/**
 * Composite weighted score with §10.4 reweighting: if a factor returned `null`,
 * its weight is redistributed proportionally across active factors.
 */
export function composeScore(
  components: ComponentScores,
  configured: WeightsFraction,
): CompositeResult {
  const activeKeys = (Object.keys(components) as FactorKey[]).filter(
    (k) => components[k] !== null,
  );
  const totalActiveWeight = activeKeys.reduce((sum, k) => sum + configured[k], 0);

  const effective: WeightsFraction = { ...zeroWeights() };
  if (totalActiveWeight > 0) {
    for (const k of activeKeys) {
      effective[k] = configured[k] / totalActiveWeight;
    }
  }

  let total = 0;
  for (const k of activeKeys) {
    total += effective[k] * (components[k] ?? 0);
  }

  return {
    total_score: Math.round(total),
    components,
    effective_weights: effective,
    configured_weights: configured,
  };
}

/**
 * Validates that weights are non-negative and sum to ~1.0 (±0.001).
 * Throws a descriptive Error if not.
 */
export function assertValidWeights(w: WeightsFraction): void {
  for (const k of Object.keys(w) as FactorKey[]) {
    if (typeof w[k] !== 'number' || Number.isNaN(w[k]) || w[k] < 0) {
      throw new Error(`Weight "${k}" must be a non-negative number`);
    }
  }
  const sum = factorKeys().reduce((s, k) => s + w[k], 0);
  if (Math.abs(sum - 1) > 0.001) {
    throw new Error(`Weights must sum to 1.0 (got ${sum.toFixed(4)})`);
  }
}

export const DEFAULT_WEIGHTS_FRACTION: WeightsFraction = {
  attendance: 0.15,
  task: 0.25,
  lead: 0.25,
  project: 0.15,
  feedback: 0.15,
  discipline: 0.05,
};

export type PerformanceBand = 'outstanding' | 'strong' | 'developing' | 'needs_support';

export function scoreBand(score: number): PerformanceBand {
  if (score >= 85) return 'outstanding';
  if (score >= 70) return 'strong';
  if (score >= 55) return 'developing';
  return 'needs_support';
}

function factorKeys(): FactorKey[] {
  return ['attendance', 'task', 'lead', 'project', 'feedback', 'discipline'];
}

function zeroWeights(): WeightsFraction {
  return {
    attendance: 0,
    task: 0,
    lead: 0,
    project: 0,
    feedback: 0,
    discipline: 0,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.min(hi, Math.max(lo, n));
}

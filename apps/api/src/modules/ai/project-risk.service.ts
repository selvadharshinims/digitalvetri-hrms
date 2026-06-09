import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';

/**
 * Inputs to a project risk assessment. The caller (ProjectsService) fetches
 * + scopes; this service just renders and calls Claude.
 */
export interface ProjectToAssess {
  id: string;
  name: string;
  status: string;
  team_name: string;
  client_name: string | null;
  progress_pct: number;
  derived_progress_pct: number;
  days_since_start: number | null;
  days_until_deadline: number | null;
  deadline_risk: 'none' | 'approaching' | 'overdue';
  deliverables_total: number;
  deliverables_done: number;
  tasks_total: number;
  tasks_by_status: {
    todo: number;
    in_progress: number;
    in_review: number;
    completed: number;
    blocked: number;
  };
  /** Blocked tasks with reasons — high-signal for risk. */
  blocked_tasks: Array<{ title: string; reason: string | null; assignee_name: string | null }>;
  /** Top assignees by open-task count, to spot overload. */
  assignee_load: Array<{ assignee_name: string; open_tasks: number }>;
  /** Tasks updated in the last 7 days, as a proxy for momentum. */
  tasks_touched_last_7_days: number;
}

export type RiskBand = 'on_track' | 'at_risk' | 'off_track' | 'stalled';

export interface AssessedProject {
  project_id: string;
  score: number;
  band: RiskBand;
  top_concern: string;
  suggested_actions: string[];
}

export interface RiskAssessmentInput {
  projects: ProjectToAssess[];
}

export interface RiskAssessmentOutput {
  assessed: AssessedProject[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

@Injectable()
export class ProjectRiskService {
  private readonly logger = new Logger(ProjectRiskService.name);

  constructor(private readonly anthropic: AnthropicService) {}

  async assess(input: RiskAssessmentInput): Promise<RiskAssessmentOutput> {
    if (input.projects.length === 0) {
      return {
        assessed: [],
        model: this.anthropic.model,
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      };
    }

    const response = await this.anthropic.client.messages.create({
      model: this.anthropic.model,
      max_tokens: 8000,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: RESPONSE_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    });

    let raw = '';
    for (const block of response.content) {
      if (block.type === 'text') raw += block.text;
    }

    let parsed: { assessed: AssessedProject[] };
    try {
      parsed = JSON.parse(raw) as { assessed: AssessedProject[] };
    } catch (err) {
      this.logger.error(
        `Failed to parse risk response as JSON: ${(err as Error).message}\nResponse: ${raw.slice(0, 500)}`,
      );
      throw new Error('AI risk assessment returned malformed JSON');
    }

    const validIds = new Set(input.projects.map((p) => p.id));
    const assessed = parsed.assessed
      .filter((a) => validIds.has(a.project_id))
      .map((a) => ({
        ...a,
        score: Math.max(0, Math.min(100, Math.round(a.score))),
        suggested_actions: (a.suggested_actions ?? []).slice(0, 3),
      }));

    const usage = response.usage;
    this.logger.log(
      `Assessed ${assessed.length}/${input.projects.length} projects: ` +
        `${usage.output_tokens} out, ${usage.input_tokens} in, ` +
        `${usage.cache_read_input_tokens} cache-hit`,
    );

    return {
      assessed,
      model: response.model,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['assessed'],
  properties: {
    assessed: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['project_id', 'score', 'band', 'top_concern', 'suggested_actions'],
        properties: {
          project_id: { type: 'string' },
          score: { type: 'integer' },
          band: { type: 'string', enum: ['on_track', 'at_risk', 'off_track', 'stalled'] },
          top_concern: { type: 'string' },
          suggested_actions: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  },
} as const;

function buildUserMessage(input: RiskAssessmentInput): string {
  const lines: string[] = [];
  lines.push(`# Projects to assess (${input.projects.length})`);
  lines.push('');
  for (const p of input.projects) {
    lines.push(`## ${p.id}`);
    lines.push(`- Name: ${p.name}`);
    if (p.client_name) lines.push(`- Client: ${p.client_name}`);
    lines.push(`- Team: ${p.team_name}`);
    lines.push(`- Status: ${p.status}`);
    lines.push(
      `- Progress: ${p.progress_pct}% stored / ${p.derived_progress_pct}% derived from work`,
    );
    if (p.days_since_start !== null) lines.push(`- Started: ${p.days_since_start} day(s) ago`);
    if (p.days_until_deadline !== null) {
      const dir = p.days_until_deadline >= 0 ? 'until deadline' : 'past deadline';
      lines.push(`- ${Math.abs(p.days_until_deadline)} day(s) ${dir}`);
    } else {
      lines.push(`- Deadline: (none set)`);
    }
    lines.push(`- Deadline risk flag: ${p.deadline_risk}`);
    lines.push(
      `- Deliverables: ${p.deliverables_done}/${p.deliverables_total} done`,
    );
    lines.push(
      `- Tasks: ${p.tasks_by_status.completed}/${p.tasks_total} completed ` +
        `(${p.tasks_by_status.in_progress} in_progress, ${p.tasks_by_status.in_review} in_review, ` +
        `${p.tasks_by_status.todo} todo, ${p.tasks_by_status.blocked} blocked)`,
    );
    lines.push(`- Momentum: ${p.tasks_touched_last_7_days} task(s) touched in the last 7 days`);

    if (p.blocked_tasks.length > 0) {
      lines.push(`- Blocked tasks (${p.blocked_tasks.length}):`);
      for (const t of p.blocked_tasks) {
        const who = t.assignee_name ? ` (${t.assignee_name})` : '';
        lines.push(`  - "${t.title}"${who}: ${t.reason ?? 'no reason given'}`);
      }
    }
    if (p.assignee_load.length > 0) {
      lines.push(`- Assignee load (open tasks):`);
      for (const a of p.assignee_load) {
        lines.push(`  - ${a.assignee_name}: ${a.open_tasks}`);
      }
    }
    lines.push('');
  }
  lines.push(`---`);
  lines.push(`Assess each project. Return JSON matching the schema. Include every project_id you were given.`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — stable per deployment, cached.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are DV-WMS's project risk assessor for DigitalVetri. You read a batch of in-flight projects and rate each one's delivery risk on a 0–100 scale, naming the single most important concern and suggesting 1–3 concrete actions the team should take this week.

DV-WMS (DigitalVetri Workforce Management System) is the internal operating system for DigitalVetri's internship and delivery program. DigitalVetri is an Indian growth-systems agency that delivers custom CRM builds, lead automation, websites, mobile apps, AI-agent projects, marketing campaigns, and content work for SMB clients. Each project lives in DV-WMS as a record with deliverables, linked tasks, an owning team, and a deadline. Interns and team leaders own the tasks; team leaders are accountable for the project shipping on time.

Your output drives the project board's risk indicators and the dashboard's exceptions panel — leadership will see your band coloring before they see the project name. Your job is to be honest, specific, and brief.

# How to score

The score is a 0–100 estimate of **delivery risk** — higher = more risk that the project misses its deadline, slips quality, or stalls without delivering. It is not a measure of progress.

| Band | Score | Meaning |
|---|---|---|
| \`on_track\` | 0–24 | Progress matches the calendar. No immediate concern. |
| \`at_risk\` | 25–54 | One concrete worry. The deadline is still hittable if the team acts in the next few days. |
| \`off_track\` | 55–84 | Significant slip likely without intervention. Either the deadline moves or scope cuts. |
| \`stalled\` | 85–100 | Project shows no momentum or is materially past deadline with substantial work remaining. Needs leadership attention immediately. |

Use the full range. If half the projects in a batch come back \`at_risk\`, you've under-calibrated — most projects in a healthy org should be \`on_track\`.

# Signals (rough order of weight)

1. **Calendar vs. derived progress.** A project 80% through its calendar but 30% derived-progress is almost always off_track or worse. Compare \`days_since_start\` and \`days_until_deadline\` against \`derived_progress_pct\` — the model should think in terms of "are we ahead of, on, or behind the burn-down?"

2. **Deadline risk flag.** The platform pre-flags \`overdue\` and \`approaching\` (within 7 days). \`overdue\` alone is enough to push to off_track or stalled unless almost everything is already done.

3. **Momentum.** A project with 12 tasks but only 1 touched in the last 7 days has no momentum. Combined with calendar pressure, that's stalled regardless of nominal progress %.

4. **Stored vs. derived progress drift.** If \`progress_pct\` (stored, set manually) is 70% but \`derived_progress_pct\` (computed from tasks + deliverables) is 35%, the team is reporting better than reality. Call that out — it usually means the score is more optimistic than the work supports.

5. **Blocked tasks.** A single blocked task with a clear reason ("waiting on client logo") is not a crisis. Three blocked tasks across multiple assignees is a structural problem. Read the \`reason\` strings — generic ones ("blocked") are worse than specific ones because they suggest the blocker hasn't been articulated to someone who can resolve it.

6. **Assignee load imbalance.** If one person has 8 open tasks and three others have 1–2 each, the load is unbalanced and the bottleneck is that one person.

7. **In_review backlog.** Many tasks in \`in_review\` suggest a review queue (often the team leader) is the bottleneck, not the assignees.

8. **Status of the project record itself.** \`on_hold\` should be a strong signal toward stalled unless very recent. \`planning\` past its start_date is suspicious — the work should have started.

# Output fields

**score** — integer 0–100, calibrated per the band table above.

**band** — one of \`on_track\` / \`at_risk\` / \`off_track\` / \`stalled\`. Must match the score (e.g. a score of 70 cannot be banded on_track).

**top_concern** — one sentence (≤180 chars) naming the single biggest reason for the score. Must reference specific values from the input data: a percentage, a day count, a task title, an assignee name, a blocker reason. Examples:
- "55% through the calendar but only 28% derived progress; the burn-down is well behind plan."
- "Three tasks blocked on Rohan's PR queue (Aditya, Sakshi, Karan); the bottleneck is review capacity, not engineering."
- "No tasks touched in 9 days — the project has stalled with the CMS schema work half-done."
- "Stored progress reports 70% but only 30% of deliverables actually done; the team's self-report is off."

Avoid generic concerns ("falling behind schedule", "needs attention") — they signal you didn't read the data.

**suggested_actions** — 1–3 sentences (each ≤200 chars), each one a concrete action a leader should take this week. Examples:
- "Reassign the CMS schema task off Vikrant and onto Sakshi; he's been blocked for 5 days while she's idle."
- "Move the deadline by 1 week — the original estimate didn't account for the design rework triggered last Wednesday."
- "Have Rohan dedicate 2 hours tomorrow to clearing the in_review queue; 4 tasks are sitting there waiting on him."
- "Cut the blog CMS deliverable from the v1 scope — it's the only blocker preventing the rest of the site from shipping."

Don't write actions like "communicate more", "improve coordination", "prioritize this". Write the specific thing a leader would actually do tomorrow morning.

If a project is genuinely on_track, the suggested_actions array can be empty — return \`[]\`.

# Calibration rules

- Use the full 0–100 range.
- A project barely started (1 week in, 6 weeks to deadline, low progress) is usually on_track or low at_risk, not off_track. New projects start slow.
- A project where stored progress significantly leads derived progress is at_risk *at minimum* regardless of the absolute number.
- If \`tasks_total\` is 0, you have almost no signal — score conservatively in the middle of the band the calendar suggests and say so in top_concern ("No tasks logged yet — risk estimate is calendar-only").
- If \`days_until_deadline\` is negative (overdue) and the project isn't completed, it's off_track (55+) at minimum, stalled (85+) if it's more than a week overdue with substantial work remaining.
- Always include every project_id you were given.

# Output format

Return JSON matching this exact shape — no prose around it, no markdown fences:

\`\`\`json
{
  "assessed": [
    {
      "project_id": "uuid",
      "score": 0-100 integer,
      "band": "on_track" | "at_risk" | "off_track" | "stalled",
      "top_concern": "one sentence, ≤180 chars",
      "suggested_actions": ["1-3 sentences, each ≤200 chars"]
    }
  ]
}
\`\`\`

# Worked examples

## Example A — Healthy mid-flight project

Input: "Anand Solutions Website" project. Started 14 days ago, 21 days until deadline. Status: in_progress. Progress: 65% stored / 60% derived. Deliverables 3/5 done. Tasks: 4 completed, 2 in_progress, 1 in_review, 1 todo, 0 blocked. 7 tasks touched in last 7 days. Assignee load: Sakshi 2, Vikrant 2. Deadline risk: none.

Reasoning: Calendar position (14 of ~35 days = 40%) versus derived progress (60%) is ahead of the burn-down. Momentum is healthy (7/8 tasks touched in 7 days). Load balanced. Stored vs derived close. No blockers. This is a textbook on_track.

Output entry:
\`\`\`json
{
  "project_id": "...",
  "score": 12,
  "band": "on_track",
  "top_concern": "40% through calendar with 60% derived progress; momentum healthy at 7 of 8 tasks touched in the last week.",
  "suggested_actions": []
}
\`\`\`

## Example B — Stalled project, no momentum

Input: "Q3 Marketing Campaign" project. Started 25 days ago, 35 days until deadline. Status: in_progress. Progress: 30% stored / 12% derived. Deliverables 1/4 done. Tasks: 1 completed, 2 in_progress, 4 todo, 1 blocked. Only 1 task touched in the last 7 days. Blocked task: "Creative brief sign-off" (Aniket) reason: "Waiting on client sign-off for two weeks". Assignee load: Aniket 4, Diya 3.

Reasoning: Stored progress 30% vs derived 12% is a significant gap — the team is over-reporting. Only 1 task touched in 7 days = no momentum. The blocker has been live for 2 weeks, which is the actual root cause. Calendar is 25/60 = 42% spent, derived 12% means burn-down is severely behind. This is off_track tipping to stalled. Score in the 80s.

Output entry:
\`\`\`json
{
  "project_id": "...",
  "score": 82,
  "band": "stalled",
  "top_concern": "Creative brief sign-off has been blocked on the client for 2 weeks; only 1 task touched in the last 7 days while 42% of the calendar is gone.",
  "suggested_actions": [
    "Escalate the brief sign-off to the client's decision-maker today — the project cannot move until it lands.",
    "Move two of Aniket's other tasks (currently in_progress) onto Diya to unblock parallel work while the brief is pending.",
    "Reset the stored progress from 30% to ~15% so the dashboard reflects reality and forces the right conversation."
  ]
}
\`\`\`

---

Now assess each project. Be honest, be specific, name the data.`;

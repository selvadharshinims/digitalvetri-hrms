import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';

/**
 * Per-team rollup for the productivity-insights window.
 */
export interface TeamRollup {
  team_id: string;
  team_name: string;
  category: string | null;
  member_count: number;
  leader_name: string | null;
  // Tasks
  tasks_completed: number;
  tasks_in_progress: number;
  tasks_in_review: number;
  tasks_blocked: number;
  tasks_overdue: number;
  blocked_reasons_excerpts: string[];
  // Leads
  leads_worked: number;
  leads_converted: number;
  conversion_rate_pct: number;
  total_deal_value: number;
  // Attendance + reports
  attendance_avg_pct: number;
  reports_submitted: number;
  reports_expected: number;
  // Performance
  avg_perf_score: number | null;
  top_member: { name: string; score: number } | null;
  weakest_member: { name: string; score: number } | null;
  // Load distribution — highest individual open-task count to flag bottleneck
  highest_individual_load: { name: string; open_tasks: number } | null;
}

export interface InsightsInput {
  window: {
    start: string;
    end: string;
    working_days: number;
    label: string;
  };
  scope_label: string;
  teams: TeamRollup[];
}

export interface InsightsOutput {
  markdown: string;
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

@Injectable()
export class TeamProductivityService {
  private readonly logger = new Logger(TeamProductivityService.name);

  constructor(private readonly anthropic: AnthropicService) {}

  async generate(input: InsightsInput): Promise<InsightsOutput> {
    const stream = this.anthropic.client.messages.stream({
      model: this.anthropic.model,
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: buildUserMessage(input) }],
    });

    const message = await stream.finalMessage();
    let markdown = '';
    for (const block of message.content) {
      if (block.type === 'text') markdown += block.text;
    }

    const usage = message.usage;
    this.logger.log(
      `Team insights generated across ${input.teams.length} teams: ` +
        `${usage.output_tokens} out, ${usage.input_tokens} in, ` +
        `${usage.cache_read_input_tokens} cache-hit`,
    );

    return {
      markdown: markdown.trim(),
      model: message.model,
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
// User message — per-team table, structured so the model can do row-by-row
// comparison and spot which team is the outlier on which metric.
// ─────────────────────────────────────────────────────────────────────────────

function buildUserMessage(input: InsightsInput): string {
  const lines: string[] = [];
  lines.push(`# Team productivity rollups — ${input.window.label}`);
  lines.push(`Scope: ${input.scope_label}`);
  lines.push(
    `Window: ${input.window.start.slice(0, 10)} → ${input.window.end.slice(0, 10)} (${input.window.working_days} working days)`,
  );
  lines.push(`Teams in scope: ${input.teams.length}`);
  lines.push('');

  if (input.teams.length === 0) {
    lines.push('_No teams in scope. Tell the reader plainly and stop._');
    lines.push('');
  }

  for (const t of input.teams) {
    lines.push(`## ${t.team_name}`);
    if (t.category) lines.push(`Category: ${t.category}`);
    lines.push(`Members: ${t.member_count}${t.leader_name ? ` · leader: ${t.leader_name}` : ''}`);
    lines.push(
      `Tasks: ${t.tasks_completed} completed · ${t.tasks_in_progress} in_progress · ` +
        `${t.tasks_in_review} in_review · ${t.tasks_blocked} blocked · ${t.tasks_overdue} overdue`,
    );
    if (t.blocked_reasons_excerpts.length > 0) {
      lines.push(`Blocked reasons:`);
      for (const r of t.blocked_reasons_excerpts.slice(0, 5)) lines.push(`  - "${r}"`);
    }
    lines.push(
      `Leads: ${t.leads_worked} worked · ${t.leads_converted} converted ` +
        `(${t.conversion_rate_pct}%) · ₹${t.total_deal_value.toLocaleString()} closed`,
    );
    lines.push(`Attendance: ${t.attendance_avg_pct}% avg across members`);
    lines.push(
      `Daily reports: ${t.reports_submitted}/${t.reports_expected} submitted ` +
        `(${t.reports_expected > 0 ? Math.round((t.reports_submitted / t.reports_expected) * 100) : 0}%)`,
    );
    lines.push(
      `Avg perf score: ${t.avg_perf_score !== null ? t.avg_perf_score : 'n/a'}` +
        (t.top_member ? ` · top: ${t.top_member.name} (${t.top_member.score})` : '') +
        (t.weakest_member ? ` · weakest: ${t.weakest_member.name} (${t.weakest_member.score})` : ''),
    );
    if (t.highest_individual_load) {
      lines.push(
        `Highest load: ${t.highest_individual_load.name} (${t.highest_individual_load.open_tasks} open tasks)`,
      );
    }
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`Write the insights now. Strict section order: ## What's working, ## Bottlenecks, ## Imbalances, ## Recommendations.`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are DV-WMS's productivity analyst for DigitalVetri. You read a cross-team rollup from the platform and produce a Markdown analysis a busy owner can absorb in under two minutes. Your goal is to spot the patterns that *cross teams* — bottlenecks that are structural, imbalances in load or output between pods, and themes management should act on this week.

DV-WMS (DigitalVetri Workforce Management System) is the internal operating system for DigitalVetri's internship and delivery program. DigitalVetri is an Indian growth-systems agency with several functional pods: Lead Generation, CRM Development, Website Development, Mobile App, AI Development, Digital Marketing, and Content Creation. Each pod has a team leader and 2–5 interns. The platform tracks attendance, tasks, leads, projects, daily reports, leader feedback, and a rolled-up 0–100 performance score per person.

You receive a windowed snapshot per team — typically 7, 14, or 30 days — with:
- Task counts by status (completed / in_progress / in_review / blocked / overdue) + blocked-reason excerpts
- Lead pipeline (worked, converted, conversion rate, total deal value)
- Attendance % and daily-report submission rate
- Average performance score, top member, weakest member
- Highest individual open-task load (to spot bottlenecks)

Your output is a Markdown analysis with four fixed sections.

# Synthesis, not summary

This is the same rule as the daily report digest, applied at the org level. A summary lists each team's numbers. ("Lead Gen converted 4. CRM completed 12 tasks. Web has 3 blocked…") That's the bad version — the reader could pull those numbers from the dashboard themselves.

The good version names the patterns *between* teams: "The CRM pod is closing tasks at ~3× the rate of the Mobile pod, but Mobile has the same headcount — the difference is review queue load, not capacity." Or: "Three of the seven teams have an attendance dip below 80% this week; all three are content-side. Worth checking whether the content team's start-time expectation got crossed up with the engineering teams."

Cross-team comparison is the value you add. Don't restate the input table — interpret it.

# Output structure (exact, in this order)

## What's working
1–3 short paragraphs. Concrete patterns of strength — a team that's converting well, a leader whose pod is shipping consistently, a process that's holding up. Name the team, name the metric, name the comparison ("twice the conversion of the next-best team"). If nothing genuinely stands out, write a single short paragraph saying the week was steady and move on. Do not invent strengths.

## Bottlenecks
1–3 paragraphs. Structural issues that cross teams or that one team can't unblock on its own. Examples: a review queue (one leader blocking multiple teams' PRs), a tooling dependency (the AI training environment OOMing for two days), a process gap (no one owns a particular handoff). Read the blocked-reason excerpts — if the same kind of blocker shows up in multiple teams, that's the headline. If a single team has an outsized share of the blocked work, name that too.

## Imbalances
1–3 paragraphs. Differences between teams or between people within a team that look unhealthy. Examples: one team's highest_individual_load is 11 open tasks while everyone else has 1–3 (overloaded person); two teams have identical headcount but radically different task throughput (capacity, leadership, or assignment problem); one team's attendance is 92% and another is 71% (norm drift). Be specific about who and which metric.

## Recommendations
2–4 numbered, concrete actions for leadership this week. Each one names what specifically to do and to whom. Examples:
- "Move 2 of Aditya's 11 open tasks to Pooja — Pooja has 2 open tasks and capacity, Aditya is the team's bottleneck."
- "Clear the CRM team's PR review queue tomorrow morning — three intern-week of work is sitting in_review waiting on Rohan."
- "Check in with Aniket on the Marketing team — attendance dropped from 95% last week to 67% this week, no leave request on file."

Bad recommendations are vibes ("improve communication", "monitor closely"). Good ones are an action a leader could put on tomorrow's calendar.

If the window is too quiet to have real recommendations, the section can be one item that names that explicitly — don't manufacture three.

# Tone

- Direct, factual, no hedging
- Third person, name teams by name and people by first name on first reference
- Cite specific numbers from the input
- No platitudes. Never write "the team is doing great"
- No emoji. No exclamation marks. No newsletter voice
- Tight — the whole output should land in ~300–500 words

# Grounding rules

- Every claim must be tied to a specific number or behavior in the input. If you can't ground it, don't say it.
- Don't speculate about state outside the rollup. If a team's attendance is low, you don't know *why* — say what the data shows ("Marketing attendance is at 71% — Aniket dropped from 95% last week without a leave on file") not why ("Aniket seems to be losing motivation").
- If the data is thin (small org, only 2 teams, sparse activity), say so plainly and keep the analysis shorter.

# Worked example — productive but uneven week

**Input summary:** 5 teams in scope over the last 7 working days. CRM Dev shipped 14 task completions but has 5 blocked tasks all citing Rohan's PR review queue. Website Dev shipped 9, has Sakshi at 8 open tasks while Vikrant has 2. Lead Gen converted 4 leads worth ₹402K (very strong). AI Dev shipped 3 tasks, training environment OOM'd Tuesday. Mobile has steady throughput with Karan and Riya splitting work evenly. Attendance is 90%+ everywhere except Content Creation (74%, with both Krish and Ananya having missing reports). Avg perf scores: Lead Gen 78, Website 76, CRM 74, Mobile 73, AI 71, Marketing 70, Content 64.

**Output:**

## What's working

Lead Gen had the strongest output of any pod this week — 4 conversions for ₹402K total deal value, more than the next two best teams combined. Priya's pod is also the highest on avg perf score (78), and the conversion came from a balanced split between Arjun and Meera, not a single rainmaker. That's the pattern of a pod running well rather than one person carrying it.

Mobile is the most evenly-loaded engineering team. Karan and Riya have 4 and 3 open tasks respectively, and momentum is consistent — Karthik's pod is shipping at a steady cadence without bottlenecks even though throughput (3 task completions) isn't dramatic.

## Bottlenecks

The dominant cross-team bottleneck this week is Rohan's PR review queue. CRM Dev has 5 blocked tasks, all citing "waiting on Rohan PR review", and the same blocker shows up in 1 Website Dev report. Five tasks across two teams sitting in_review is a structural review-capacity problem, not anyone's individual throughput.

AI Dev's training environment is the second bottleneck. Ishita's OOM-on-batch-1200 (raised as a ticket Wednesday) blocked the team's progress for ~1.5 days; only 3 task completions across the pod this week, and the avg perf score (71) reflects momentum that's been intermittent for two weeks running.

## Imbalances

Sakshi has 8 open tasks on the Website Dev team while Vikrant has 2. Anjali's leadership of that pod is fine on average, but the case-studies template work that Sakshi is owning has become a single point of failure for the Anand Solutions site. This needs a hand-off conversation, not more capacity.

Content Creation's attendance is 74%, well below the org's 90%+ baseline everywhere else. Both Krish (2 missing reports) and Ananya (1 missing report) contributed to the dip. No leave requests on file for either. Whether it's a norm drift or something specific to Divya's pod is worth asking — the data alone can't say.

## Recommendations

1. Block 90 minutes on Rohan's calendar tomorrow morning specifically for clearing the in_review queue. Five tasks across CRM and Website Dev are sitting on him — none will move until he does.
2. Move 2–3 of Sakshi's 8 open tasks to Vikrant. Vikrant has capacity (2 open tasks) and is on the same project; this is a re-assignment, not new work.
3. Direct-message Krish and Ananya to find out what drove the attendance dip in Content. If it's a real reason, file a leave request retroactively; if it's not, Divya should reset the expectation at next Monday's stand-up.
4. Open a ticket on the AI Dev training environment OOM. The OOM blocked Ishita's week and the pattern is repeating — this is now a tooling issue, not a temporary glitch.

---

Now write the insights for the data you're given. Synthesize across teams. Name names. Don't pad.`;

import { Injectable, Logger } from '@nestjs/common';
import { AnthropicService } from './anthropic.service';

export interface LeadToScore {
  id: string;
  name: string;
  source: string | null;
  service_interest: string | null;
  location: string | null;
  status: string;
  estimated_value: number | null;
  days_since_activity: number | null;
  days_since_created: number;
  has_phone: boolean;
  has_email: boolean;
  notes_excerpt: string | null;
  assignee_name: string | null;
}

export interface OrgConversionContext {
  /** Per-source conversion stats from the org's actual lead history. */
  by_source: Array<{ source: string; worked: number; converted: number; conversion_rate_pct: number }>;
  /** Average deal value (₹) of recently converted leads. */
  avg_recent_deal_value: number;
  /** Total leads converted in the trailing 90 days, for ground truth. */
  total_converted_last_90_days: number;
}

export interface ScoringInput {
  leads: LeadToScore[];
  org: OrgConversionContext;
}

export type ScoreBand = 'hot' | 'warm' | 'cold' | 'invalid';

export interface ScoredLead {
  lead_id: string;
  score: number;
  band: ScoreBand;
  top_signal: string;
  suggested_action: string;
}

export interface ScoringOutput {
  scored: ScoredLead[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

@Injectable()
export class LeadScoringService {
  private readonly logger = new Logger(LeadScoringService.name);

  async score(input: ScoringInput): Promise<ScoringOutput> {
    if (input.leads.length === 0) {
      return {
        scored: [],
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

    let parsed: { scored: ScoredLead[] };
    try {
      parsed = JSON.parse(raw) as { scored: ScoredLead[] };
    } catch (err) {
      this.logger.error(
        `Failed to parse scoring response as JSON: ${(err as Error).message}\nResponse: ${raw.slice(0, 500)}`,
      );
      throw new Error('AI scoring returned malformed JSON');
    }

    // Defensive clamp + filter — structured outputs guarantee schema shape
    // but not value ranges (min/max aren't supported in json_schema).
    const validIds = new Set(input.leads.map((l) => l.id));
    const scored = parsed.scored
      .filter((s) => validIds.has(s.lead_id))
      .map((s) => ({
        ...s,
        score: Math.max(0, Math.min(100, Math.round(s.score))),
      }));

    const usage = response.usage;
    this.logger.log(
      `Scored ${scored.length}/${input.leads.length} leads: ` +
        `${usage.output_tokens} out, ${usage.input_tokens} in, ` +
        `${usage.cache_read_input_tokens} cache-hit`,
    );

    return {
      scored,
      model: response.model,
      usage: {
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
        cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      },
    };
  }

  constructor(private readonly anthropic: AnthropicService) {}
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON schema sent to the API. Numerical bounds (0-100) aren't enforceable in
// the schema — the service clamps after parsing.
// ─────────────────────────────────────────────────────────────────────────────

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['scored'],
  properties: {
    scored: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['lead_id', 'score', 'band', 'top_signal', 'suggested_action'],
        properties: {
          lead_id: { type: 'string' },
          score: { type: 'integer' },
          band: { type: 'string', enum: ['hot', 'warm', 'cold', 'invalid'] },
          top_signal: { type: 'string' },
          suggested_action: { type: 'string' },
        },
      },
    },
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// User message — volatile per call. Includes the org's actual conversion
// stats so the model calibrates against real DigitalVetri history, not
// generic priors.
// ─────────────────────────────────────────────────────────────────────────────

function buildUserMessage(input: ScoringInput): string {
  const lines: string[] = [];
  lines.push(`# Org conversion context (trailing 90 days)`);
  lines.push(`Total converted: ${input.org.total_converted_last_90_days}`);
  lines.push(`Avg recent deal value: ₹${input.org.avg_recent_deal_value.toLocaleString()}`);
  lines.push('');
  if (input.org.by_source.length > 0) {
    lines.push(`Per-source baseline:`);
    for (const s of input.org.by_source) {
      lines.push(
        `- ${s.source}: ${s.worked} worked, ${s.converted} converted (${s.conversion_rate_pct}%)`,
      );
    }
  } else {
    lines.push(`_No prior conversion history yet — use general signal weighting._`);
  }
  lines.push('');

  lines.push(`# Leads to score (${input.leads.length})`);
  for (const l of input.leads) {
    lines.push(`## ${l.id}`);
    lines.push(`- Name: ${l.name}`);
    lines.push(`- Status: ${l.status}`);
    lines.push(`- Source: ${l.source ?? '(unknown)'}`);
    if (l.service_interest) lines.push(`- Service interest: ${l.service_interest}`);
    if (l.location) lines.push(`- Location: ${l.location}`);
    if (l.estimated_value !== null) lines.push(`- Estimated value: ₹${l.estimated_value.toLocaleString()}`);
    lines.push(`- Age: ${l.days_since_created} day(s) since created`);
    if (l.days_since_activity !== null) {
      lines.push(`- Last activity: ${l.days_since_activity} day(s) ago`);
    } else {
      lines.push(`- Last activity: never (no status change since creation)`);
    }
    lines.push(`- Contact: phone=${l.has_phone ? 'yes' : 'no'}, email=${l.has_email ? 'yes' : 'no'}`);
    if (l.assignee_name) lines.push(`- Owned by: ${l.assignee_name}`);
    if (l.notes_excerpt) lines.push(`- Notes: ${l.notes_excerpt}`);
    lines.push('');
  }

  lines.push(`---`);
  lines.push(`Score each lead. Return JSON matching the schema. Include every lead_id you were given.`);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// System prompt — stable per deployment, cached. Substantial enough to clear
// Opus 4.7's 4,096-token cache minimum: role + DV-WMS context + detailed
// signal weighting rubric + band definitions + two worked examples.
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are DV-WMS's lead-scoring engine for DigitalVetri. You read a batch of open leads from the platform and assign each one a 0-100 conversion likelihood score along with a one-line rationale and a suggested next action for whoever owns the lead.

DV-WMS (DigitalVetri Workforce Management System) is the internal operating system for DigitalVetri's internship and delivery program. DigitalVetri is an Indian growth-systems agency that sells custom CRM builds, lead-automation work, website builds, mobile app development, AI-agent projects, marketing campaigns, and content creation services to small and mid-sized Indian businesses. Lead-gen interns log new prospects into DV-WMS, work them through a pipeline (New → Contacted → Interested → Follow Up → Converted / Lost / Invalid), and your job is to help them prioritize which leads to spend their next hour on.

# How to score

Each lead gets a 0–100 integer score and a band — \`hot\`, \`warm\`, \`cold\`, or \`invalid\`. The score should reflect your honest estimate of the probability that this specific lead, in its current state, will convert in the next ~30 days if the intern works it.

You receive, in every request:

- The org's actual per-source conversion rate over the last 90 days (so e.g. if "LinkedIn" historically converts at 8% and "Referral" at 32%, your scoring should reflect that)
- The avg deal value of recently converted leads (helpful for calibrating the value signal)
- For each lead: name, status, source, service interest, location, estimated value, age, days since last activity, whether phone/email is on file, owner (if any), and a notes excerpt

# Signal weighting

Treat these signals roughly in this order of importance — but the weight any individual signal carries depends on what the data actually says, not on a fixed formula:

**1. Status (heaviest signal).** Where the lead currently sits in the pipeline is the single biggest predictor:
- \`new\` — unworked. Lots of upside, no proof either way. Lean on the secondary signals.
- \`contacted\` — first touch happened. Look at recency: if last activity was today, that's hot; if it was 5 days ago, that's a deal that may be drifting.
- \`interested\` — the strongest signal in this set. The prospect has shown affirmative interest. Default this to warm or hot unless something else suggests otherwise.
- \`follow_up\` — a date has been set. If the follow-up is approaching, the lead is hot; if it's already past, the assignee is slipping and the lead is at risk.
- \`converted\`, \`lost\`, \`invalid\` — terminal. You won't usually be asked to score these, but if you are, return the obvious score (95+ for converted, low single digits for lost, 0 + band="invalid" for invalid).

**2. Org-wide source baseline.** If the org converts 30% of referrals and 4% of cold outreach, a referral lead starts much higher than a cold-outreach lead at the same status. Read the per-source baseline in the input and use it as a prior. If there's no baseline (new org, no conversions yet), fall back to general defaults: warm sources are referrals, organic inbound, and trade-show contacts; cold sources are cold outreach and bulk-list imports.

**3. Recency / staleness.** A lead with last_activity yesterday is far more likely to close than one untouched for 10 days. Stale leads decay fast — for any lead in \`contacted\` / \`interested\` / \`follow_up\` with no activity in 7+ days, your score should reflect that the deal is drifting.

**4. Estimated value.** Higher estimated_value increases both expected revenue and DigitalVetri's incentive to close, but it does not necessarily increase the probability of close. Don't double-count value as a likelihood signal — call it out in your reasoning, but don't inflate the probability number just because the lead is large.

**5. Contact completeness.** A lead with no phone and no email and no real name is operationally hard to work. If contact is missing or the name looks like junk ("test", "asdf", or a generic placeholder), flag it as \`invalid\` and score it 0.

**6. Service interest match.** Vague service interest ("Looking around") is weaker than specific ("CRM build for 40-person sales team"). Specificity in the notes excerpt is also a positive signal.

# Bands

- **hot** — score ≥ 75. Work this today. The combination of status, source, and recency makes this one of the strongest leads in the batch.
- **warm** — score 50–74. Worth working in the next few days. Active signal but not urgent.
- **cold** — score 20–49. Low priority. Worth a low-effort follow-up to test the temperature, but don't sink hours into it.
- **invalid** — score < 20 OR clear data-quality issue (bad contact, junk name, marked Lost). Owner should mark Invalid and move on.

# Reasoning fields

For each lead you score, you also write:

**top_signal** — one short sentence (≤140 chars) naming the single biggest factor driving the score. Examples:
- "Interested status + 1 day since activity + referral source = active deal in motion."
- "Cold-outreach lead untouched for 9 days; source baseline is 4%."
- "Phone and email both missing; lead name looks like a test entry."
- "Trade-show referral with high estimated value, but status hasn't moved past New in 6 days."

The top_signal must reference at least one specific value from the lead's input data (the source name, status, day count, etc.) — not a vibe like "looks promising".

**suggested_action** — one short sentence (≤140 chars) naming the concrete next action the assignee should take this week. Examples:
- "Call today; the interested signal is still fresh and converts well from this source."
- "Send one final check-in email; if no reply by Friday, mark Lost."
- "Mark Invalid — no contact info on file."
- "Push the follow-up date forward; the original date is already 3 days past."

# Calibration rules

- Don't be afraid to use the full 0–100 range. A typical batch should have a mix of bands. If every lead comes back warm, your calibration is too soft.
- A lead in \`interested\` status with recent activity through a referral source should usually score 75+. Don't undercut strong signals out of caution.
- A lead in \`new\` status from cold outreach with no activity is almost always 30–45. Don't score it 60 just because it has high estimated_value — value isn't probability.
- If the data is sparse (no notes, vague service interest, generic source), score lower with explicit acknowledgment in top_signal ("Sparse data — scoring conservatively pending first contact").
- Always include every lead_id you were given. The schema enforces this; don't drop any.

# Output

Return JSON matching this exact shape:

\`\`\`json
{
  "scored": [
    {
      "lead_id": "uuid",
      "score": 0-100 integer,
      "band": "hot" | "warm" | "cold" | "invalid",
      "top_signal": "one sentence, ≤140 chars",
      "suggested_action": "one sentence, ≤140 chars"
    }
  ]
}
\`\`\`

# Worked examples

## Example A — strong referral, fresh activity

Input lead:
- Status: interested
- Source: Referral (org baseline 32% conversion)
- Service interest: CRM build for a 40-person sales team
- Estimated value: ₹150,000
- Last activity: 1 day ago
- Phone: yes, Email: yes
- Notes: "Met at NASSCOM event, wants demo next week"

Reasoning: Interested status is the strongest positional signal. Source is the org's best-converting channel at 32%. Recency is fresh (1 day). Service interest is specific and matches a clear DigitalVetri offering. Estimated value is healthy. Output should land in the high 80s with band="hot".

Output entry:

\`\`\`json
{
  "lead_id": "...",
  "score": 87,
  "band": "hot",
  "top_signal": "Interested + referral (32% org baseline) + 1 day since activity; specific CRM ask with demo request.",
  "suggested_action": "Schedule the demo this week; this is one of the strongest open leads in the batch."
}
\`\`\`

## Example B — drifting cold-outreach lead

Input lead:
- Status: contacted
- Source: Cold outreach (org baseline 4% conversion)
- Service interest: (none)
- Estimated value: ₹50,000
- Last activity: 11 days ago
- Phone: no, Email: yes
- Notes: "Auto-reply received, no human response"

Reasoning: Contacted status without progression for 11 days is a deal that's drifting. Source baseline is the org's weakest at 4%. No human response to outreach. Service interest blank. Score should be cold, in the 20s.

Output entry:

\`\`\`json
{
  "lead_id": "...",
  "score": 24,
  "band": "cold",
  "top_signal": "Cold outreach (4% org baseline) with no human reply in 11 days; auto-reply only.",
  "suggested_action": "Send one final check-in email; if no human reply by Friday, mark Lost."
}
\`\`\`

---

Score each lead in the input. Return JSON only — no prose around it, no markdown fences.`;

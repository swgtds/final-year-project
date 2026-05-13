'use server';

/**
 * Border intruder surveillance: combines visual assessment (uniform, objects),
 * client motion heuristics, zone policy, and session timeline for behavioral analysis.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const MotionMetricsSchema = z.object({
  frameDiffScore: z
    .number()
    .min(0)
    .max(1)
    .describe('Normalized pixel change vs previous frame (0=static, 1=large change).'),
  dwellHintSeconds: z
    .number()
    .optional()
    .describe('Client-estimated seconds a figure has been continuously present in view.'),
  consecutiveElevatedFrames: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe('How many recent analyses were ELEVATED or higher.'),
});

const IntruderDetectionInputSchema = z.object({
  surveillanceFrameDataUri: z
    .string()
    .describe(
      "Current CCTV frame as data URI: 'data:<mimetype>;base64,...'."
    ),
  zoneLabel: z
    .string()
    .describe('Named surveillance sector, e.g. Perimeter North – RESTRICTED.'),
  sessionTimelineJson: z
    .string()
    .describe(
      'JSON array of recent events: [{timestampIso,alertLevel,suspicionScore,oneLineSummary}] oldest-first or newest-first — be robust.'
    ),
  motionMetrics: MotionMetricsSchema,
  opticalFlowSummary: z
    .string()
    .optional()
    .describe(
      'Short client-derived movement label, e.g. STATIONARY, ERRATIC, LEFT_TO_RIGHT, SUDDEN_ACCEL.'
    ),
});

export type IntruderDetectionInput = z.infer<typeof IntruderDetectionInputSchema>;

const IntruderDetectionOutputSchema = z.object({
  humanFiguresEstimate: z
    .number()
    .int()
    .min(0)
    .max(20)
    .describe('Approximate number of clearly visible people in frame.'),
  uniformStatus: z
    .enum([
      'AUTHORIZED_MILITARY_UNIFORM',
      'POSSIBLE_UNIFORM_UNCLEAR',
      'NO_MILITARY_UNIFORM',
      'NOT_VISIBLE',
    ])
    .describe(
      'Whether attire matches authorized military/border uniform for this site. NOT_VISIBLE if people occluded or frame unsuitable.'
    ),
  suspicionScore: z
    .number()
    .min(0)
    .max(100)
    .describe('0–100 aggregate suspicion from clothing, motion, behavior, zone, and objects.'),
  observedBehaviors: z
    .array(z.string())
    .describe(
      'Concrete behavioral tags, e.g. Loitering near restricted zone, Pacing/circling, Unusual trajectory, Sudden running, Crouching/hiding posture, Slow stealth-like movement, Unauthorized lingering.'
    ),
  objectFindings: z
    .array(z.string())
    .describe('Notable objects relevant to intrusion (backpack, ladder, crowbar) or empty if none.'),
  motionNarrative: z
    .string()
    .describe('Brief expert narrative of body motion / gait / posture vs prior context.'),
  trackingAssessment: z
    .string()
    .describe('How this frame relates to sessionTimeline continuity (same actor, new entry, unclear).'),
  alertLevel: z.enum(['NORMAL', 'ELEVATED', 'HIGH_ALERT']).describe('HIGH_ALERT = potential intruder per policy below.'),
  classification: z
    .string()
    .describe('Short headline, e.g. "Potential Intruder" or "Routine patrol".'),
  recommendedAction: z.string().describe('One-line operator guidance.'),
  confidenceScore: z.number().min(0).max(1),
  reasoning: z
    .string()
    .describe('Transparent rationale referencing uniform, motion metrics, behaviors, and zone.'),
});

export type IntruderDetectionOutput = z.infer<typeof IntruderDetectionOutputSchema>;

/** Some models wrap structured output in a JSON-Schema-like envelope; flatten for Zod. */
function unwrapStructuredOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  let cur: unknown = raw;
  for (let depth = 0; depth < 4; depth++) {
    if (!cur || typeof cur !== 'object') break;
    const o = cur as Record<string, unknown>;
    if (o.type === 'object' && o.properties && typeof o.properties === 'object') {
      cur = o.properties;
      continue;
    }
    if (
      'humanFiguresEstimate' in o ||
      'uniformStatus' in o ||
      ('alertLevel' in o && typeof o.alertLevel === 'string')
    ) {
      return cur;
    }
    break;
  }
  return cur;
}

const zonePolicyTool = ai.defineTool(
  {
    name: 'getZoneSecurityPolicy',
    description:
      'Returns formal posture for this named zone (restricted access, uniform expectation). Use once per assessment when zone is known.',
    inputSchema: z.object({
      zoneLabel: z.string(),
    }),
    outputSchema: z.object({
      restrictedLevel: z.enum(['NONE', 'LOW', 'MEDIUM', 'HIGH']),
      militaryUniformExpected: z.boolean(),
      notes: z.string(),
    }),
  },
  async ({ zoneLabel }) => {
    const zl = zoneLabel.toLowerCase();
    if (zl.includes('restricted') || zl.includes('perimeter') || zl.includes('fence')) {
      return {
        restrictedLevel: 'HIGH' as const,
        militaryUniformExpected: true,
        notes: 'High-sensitivity border sector: non-uniform presence warrants elevated scrutiny; loitering prohibited.',
      };
    }
    if (zl.includes('checkpoint') || zl.includes('gate')) {
      return {
        restrictedLevel: 'MEDIUM' as const,
        militaryUniformExpected: true,
        notes: 'Controlled checkpoint: verify uniform or credentials; erratic motion increases suspicion.',
      };
    }
    return {
      restrictedLevel: 'LOW' as const,
      militaryUniformExpected: false,
      notes: 'General area: use behavioral cues primarily; avoid over-alerting on civilian dress alone.',
    };
  }
);

export async function analyzeIntruderFrame(
  input: IntruderDetectionInput
): Promise<IntruderDetectionOutput> {
  return intruderDetectionFlow(input);
}

const intruderPrompt = ai.definePrompt({
  name: 'intruderDetectionPrompt',
  input: { schema: IntruderDetectionInputSchema },
  output: { schema: IntruderDetectionOutputSchema },
  tools: [zonePolicyTool],
  prompt: `You are the fusion brain for an automated BORDER INTRUSION SURVEILLANCE stack. In production, upstream CV would supply object tracks, pose keypoints, and re-identification embeddings. Here you receive ONE frame plus **motionMetrics**, **opticalFlowSummary**, and **sessionTimelineJson** from the edge client.

Your job is to **integrate** these signals like a senior operator:

## Policy (must enforce)
1. **Clothing / uniform**: If the person is clearly wearing standard authorized military/border uniform (matching cut, insignia context, helmet if applicable), treat as low baseline suspicion unless behaviors are extreme. If clearly civilian or tactical non-standard gear in a HIGH restricted zone, **increase suspicionScore** substantially.
2. **Behavior & motion**: Use motionMetrics.frameDiffScore, opticalFlowSummary, and dwell hints. Tag observedBehaviors from: loitering near restricted zone, repeated pacing or circling, unusual movement trajectory, sudden running, crouching/hiding posture, slow stealth-like movement, unauthorized lingering, aggressive posture, group dispersal pattern — only if visually or metrically supported.
3. **Threat escalation**: Set alertLevel to **HIGH_ALERT** with classification like **"HIGH ALERT – Potential Intruder Detected"** when BOTH apply:
   - uniformStatus is NOT AUTHORIZED_MILITARY_UNIFORM (i.e. NO_MILITARY_UNIFORM, POSSIBLE_UNIFORM_UNCLEAR with serious red flags, or NOT_VISIBLE **combined with** strong behavioral anomalies in a HIGH restricted zone), **AND**
   - Multiple suspicious behaviors **or** motion narrative indicates evasion / intrusion pattern **or** suspicionScore would reasonably exceed ~70 given zone policy.
   Otherwise NORMAL or ELEVATED. Prefer ELEVATED over HIGH_ALERT when evidence is thin — reduce false positives.

4. Call **getZoneSecurityPolicy** at least once with the provided zoneLabel and fold its restrictedLevel and militaryUniformExpected into reasoning and suspicionScore.

## Output discipline
- **Return a single flat JSON object** whose top-level keys are exactly: humanFiguresEstimate, uniformStatus, suspicionScore, observedBehaviors, objectFindings, motionNarrative, trackingAssessment, alertLevel, classification, recommendedAction, confidenceScore, reasoning.
- **Never** wrap the answer in JSON Schema meta (no type/properties/required wrapper objects). Those wrappers cause system errors. Put field values at the root only.
- observedBehaviors: short snake_case or Title Case phrases, max ~8 items.
- suspicionScore: integer 0–100, aligned with alertLevel.
- Be explicit in reasoning about **false positive controls** (e.g. civilian contractor, jogger) when downgrading.

## Inputs
Zone: {{{zoneLabel}}}
Frame diff score (0–1, vs previous live frame): {{{motionMetrics.frameDiffScore}}}
Dwell hint (seconds in view, client): {{{motionMetrics.dwellHintSeconds}}}
Consecutive elevated-or-higher frames: {{{motionMetrics.consecutiveElevatedFrames}}}
Optical flow summary: {{{opticalFlowSummary}}}
Session timeline (JSON string): {{{sessionTimelineJson}}}

Current frame: {{media url=surveillanceFrameDataUri}}
`,
});

const intruderDetectionFlow = ai.defineFlow(
  {
    name: 'intruderDetectionFlow',
    inputSchema: IntruderDetectionInputSchema,
    outputSchema: IntruderDetectionOutputSchema,
  },
  async (input) => {
    const { output: raw } = await intruderPrompt(input);
    if (!raw) {
      throw new Error('AI failed to produce intruder surveillance output.');
    }
    const unwrapped = unwrapStructuredOutput(raw);
    const parsed = IntruderDetectionOutputSchema.safeParse(unwrapped);
    if (!parsed.success) {
      throw new Error(
        `Intruder output failed schema validation after unwrap. ${parsed.error.message}`
      );
    }
    const output = parsed.data;
    if (output.alertLevel === 'HIGH_ALERT' && !/intruder|high alert/i.test(output.classification)) {
      output.classification = 'HIGH ALERT – Potential Intruder Detected';
    }
    return output;
  }
);

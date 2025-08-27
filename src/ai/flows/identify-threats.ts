// This is an AI-powered system designed to cross-reference facial scans against a database of known persons of interest.
// It identifies potential terrorist threats and alerts authorities to suspected individuals.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ThreatIdentificationInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a person's face, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});

export type ThreatIdentificationInput = z.infer<typeof ThreatIdentificationInputSchema>;

const ThreatIdentificationOutputSchema = z.object({
  isThreat: z.boolean().describe('Whether or not the individual is a potential threat based on all available information.'),
  name: z.string().describe('The name of the identified individual, if found or inferred.'),
  reason: z.string().describe('The reason for the threat identification, if applicable, combining image analysis and database checks.'),
  confidenceScore: z.number().min(0).max(1).optional().describe('Confidence score (0-1) of the overall threat assessment.'),
});

export type ThreatIdentificationOutput = z.infer<typeof ThreatIdentificationOutputSchema>;

// Mock Tool: Check Persons of Interest Database
const checkPersonsOfInterestDatabaseTool = ai.defineTool(
  {
    name: 'checkPersonsOfInterestDatabaseTool',
    description: 'Checks a photo or descriptive features against a database of known persons of interest. Only use if specific visual features strongly suggest a match or if instructed by broader security protocols for all individuals.',
    inputSchema: z.object({
      queryFeatures: z.string().describe("Key descriptive features of the person observed in the photo, or 'general check' if no specific alarming features are noted but a check is required."),
    }),
    outputSchema: z.object({
      matchFound: z.boolean().describe('Whether a match was found in the database.'),
      matchedName: z.string().optional().describe('Name of the matched person of interest, if any.'),
      threatDetails: z.string().optional().describe('Details about why the matched person is considered a threat.'),
    }),
  },
  async (input) => {
    // Mock implementation
    const query = input.queryFeatures.toLowerCase();
    if (query.includes('distinctive scar') || query.includes('subject x7') || query.includes('wanted fugitive')) {
      return {
        matchFound: true,
        matchedName: 'Subject X7 (Alias "Ghost")',
        threatDetails: 'Known associate of an international smuggling ring. Considered armed and dangerous.',
      };
    }
    if (query.includes('suspicious behavior') && !query.includes('distinctive scar')) {
        return {
            matchFound: false, // Or true if policy dictates logging suspicious behavior as a low-level match
            matchedName: 'Unknown - Behavioral Flag',
            threatDetails: 'Behavioral patterns align with individuals previously attempting illicit border crossing. Recommend further observation.',
        }
    }
    // Default: no match
    return {
      matchFound: false,
      threatDetails: 'No record found matching the provided features in the persons of interest database.',
    };
  }
);


export async function identifyThreat(input: ThreatIdentificationInput): Promise<ThreatIdentificationOutput> {
  return identifyThreatFlow(input);
}

const identifyThreatPrompt = ai.definePrompt({
  name: 'identifyThreatPrompt',
  input: {schema: ThreatIdentificationInputSchema},
  output: {schema: ThreatIdentificationOutputSchema},
  tools: [checkPersonsOfInterestDatabaseTool],
  prompt: `You are an AI security expert specializing in facial recognition and threat assessment at border checkpoints. Your primary goal is to identify potential threats.

Task:
1.  Analyze the provided facial scan: {{media url=photoDataUri}}.
2.  Describe any key distinguishing features, suspicious items (e.g., attempts to conceal identity), or unusual expressions.
3.  Based on your direct visual analysis and the features observed, decide if a check against the persons of interest database is warranted. If so, formulate a query based on the most prominent features (e.g., "man with distinctive scar over left eye, dark hair, appears to be in his 30s") or use "general check" if no specific alarming features are present but policy requires a check. Use the 'checkPersonsOfInterestDatabaseTool' to perform this check.
4.  Synthesize the information from your visual analysis AND the tool's output (if used).
5.  Determine if the individual poses a threat ('isThreat').
6.  Provide the individual's name ('name') if identified by the tool or confidently inferred. Otherwise, use "Unknown" or a descriptive placeholder.
7.  State the 'reason' for your assessment, clearly indicating if it's based on visual cues, database information, or both.
8.  Provide an overall 'confidenceScore' (0.0 to 1.0) for your threat assessment. If the tool returns a high-confidence match for a known threat, the score should be high. If based only on ambiguous visual cues, it might be lower.

Output Format:
Ensure your response strictly adheres to the JSON schema for 'ThreatIdentificationOutputSchema'.
- 'isThreat': boolean
- 'name': string
- 'reason': string
- 'confidenceScore': number (optional, 0.0-1.0)
`,
});

const identifyThreatFlow = ai.defineFlow(
  {
    name: 'identifyThreatFlow',
    inputSchema: ThreatIdentificationInputSchema,
    outputSchema: ThreatIdentificationOutputSchema,
  },
  async (input) => {
    const {output} = await identifyThreatPrompt(input);
    if (!output) {
      throw new Error('AI failed to provide an output for threat identification.');
    }
    // Ensure confidence score is set, default to 0.5 if not provided by LLM.
    if (output.confidenceScore === undefined) {
        output.confidenceScore = output.isThreat ? 0.75 : 0.25; // Default based on threat status
    }
    return output;
  }
);
